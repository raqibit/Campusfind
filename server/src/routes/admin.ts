import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Handover } from "../models/handover.js";
import { Match } from "../models/match.js";
import { Notification } from "../models/notification.js";
import { createDownloadUrl } from "../services/object-storage.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/claims",
  asyncRoute(async (request, response) => {
    const status = z.enum(["pending", "approved", "rejected", "more_evidence"]).optional().parse(request.query.status);
    const matches = await Match.find({ university: request.auth!.universityId }).distinct("_id");
    const filter: Record<string, unknown> = { match: { $in: matches } };
    if (status) filter.status = status;
    const claims = await Claim.find(filter)
      .select("+privateDetail +proofUrls +proofKeys +reviewNote")
      .populate("claimant", "fullName email matricNumber verified")
      .populate({ path: "match", populate: [{ path: "lostReport", select: "+privateDetails title category publicDescription location happenedAt" }, { path: "foundReport", select: "+privateDetails title category publicDescription location happenedAt reporter" }] })
      .sort({ createdAt: 1 })
      .lean();
    response.setHeader("Cache-Control", "no-store");
    response.json({ data: claims.map(({ proofKeys, ...claim }) => ({ ...claim, evidenceCount: proofKeys?.length ?? 0 })) });
  }),
);

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected", "more_evidence"]),
  reviewNote: z.string().trim().min(3).max(1000),
  handoverPoint: z.string().trim().min(3).max(150).optional(),
  scheduledFor: z.coerce.date().optional(),
});

router.patch(
  "/claims/:claimId",
  asyncRoute(async (request, response) => {
    const input = reviewSchema.parse(request.body);
    if (input.status === "approved" && (!input.handoverPoint || !input.scheduledFor)) {
      throw new AppError(422, "An approved claim needs a handover point and time.", "HANDOVER_REQUIRED");
    }
    const claim = await Claim.findById(request.params.claimId).select("+privateDetail +reviewNote");
    if (!claim) throw new AppError(404, "Claim not found.", "CLAIM_NOT_FOUND");
    const match = await Match.findOne({ _id: claim.match, university: request.auth!.universityId });
    if (!match) throw new AppError(403, "This claim belongs to another university.", "FORBIDDEN");

    claim.status = input.status;
    claim.reviewNote = input.reviewNote;
    claim.reviewer = request.auth!.userId as never;
    claim.reviewedAt = new Date();
    await claim.save();

    if (input.status === "approved") {
      match.status = "approved";
      await match.save();
      await Handover.findOneAndUpdate(
        { claim: claim._id },
        {
          $setOnInsert: {
            claim: claim._id,
            handoverPoint: input.handoverPoint,
            scheduledFor: input.scheduledFor,
            auditCode: `CF-${randomBytes(4).toString("hex").toUpperCase()}`,
          },
        },
        { upsert: true, new: true },
      );
      await Notification.create({
        user: claim.claimant,
        kind: "claim",
        title: "Your claim was approved",
        message: `Your item can be collected at ${input.handoverPoint}.`,
        actionPath: `/claims/${claim._id}`,
      });
    } else {
      match.status = input.status === "rejected" ? "rejected" : "reviewing";
      await match.save();
      await Notification.create({
        user: claim.claimant,
        kind: "claim",
        title: input.status === "rejected" ? "Claim not approved" : "More evidence is needed",
        message: input.reviewNote,
        actionPath: `/claims/${claim._id}`,
      });
    }
    response.json({ data: { id: claim.id, status: claim.status, reviewedAt: claim.reviewedAt } });
  }),
);


router.get(
  "/claims/:claimId/evidence/:index",
  asyncRoute(async (request, response) => {
    const index = z.coerce.number().int().min(0).max(4).parse(request.params.index);
    const claim = await Claim.findById(request.params.claimId).select("+proofKeys").lean();
    if (!claim) throw new AppError(404, "Claim not found.", "CLAIM_NOT_FOUND");
    const match = await Match.findOne({ _id: claim.match, university: request.auth!.universityId }).select("_id").lean();
    if (!match) throw new AppError(404, "Claim not found.", "CLAIM_NOT_FOUND");
    const key = claim.proofKeys?.[index];
    if (!key) throw new AppError(404, "Evidence file not found.", "EVIDENCE_NOT_FOUND");
    response.setHeader("Cache-Control", "no-store");
    response.json({ data: { url: createDownloadUrl(key), expiresInSeconds: 300 } });
  }),
);



export default router;
