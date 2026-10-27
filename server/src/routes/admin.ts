import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Handover } from "../models/handover.js";
import { Match } from "../models/match.js";
import { Notification } from "../models/notification.js";
import { Report } from "../models/report.js";
import { createDownloadUrl, getObjectMetadata } from "../services/object-storage.js";
import { isSafeUploadKey, maxUploadBytes } from "../services/storage-keys.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/claims",
  asyncRoute(async (request, response) => {
    const status = z.enum(["pending", "approved", "rejected", "more_evidence"]).optional().parse(request.query.status);
    const matches = await Match.find({ university: request.auth!.universityId }).distinct("_id");
    const filter: Record<string, unknown> = { match: { $in: matches } };
    filter.status = status || { $in: ["pending", "more_evidence"] };
    const claims = await Claim.find(filter)
      .select("+privateDetail +proofUrls +proofKeys +reviewNote +evidenceHistory")
      .populate("claimant", "fullName email matricNumber verified")
      .populate({ path: "match", populate: [{ path: "lostReport", select: "+privateDetails title category publicDescription location happenedAt" }, { path: "foundReport", select: "+privateDetails title category publicDescription location happenedAt reporter" }] })
      .sort({ createdAt: 1 })
      .lean();
    response.json({ data: claims.map((claim) => {
      const { proofKeys, evidenceHistory, ...safeClaim } = claim;
      return {
        ...safeClaim,
        proofCount: proofKeys?.length || 0,
        evidenceHistory: evidenceHistory?.map((version) => ({
          privateDetail: version.privateDetail,
          proofUrls: version.proofUrls,
          submittedAt: version.submittedAt,
        })),
      };
    }) });
  }),
);

router.get(
  "/claims/:claimId/evidence/:index",
  asyncRoute(async (request, response) => {
    const index = z.coerce.number().int().min(0).max(4).parse(request.params.index);
    const claim = await Claim.findById(request.params.claimId).select("+proofKeys match").lean();
    if (!claim) throw new AppError(404, "Claim not found.", "CLAIM_NOT_FOUND");
    const match = await Match.findOne({ _id: claim.match, university: request.auth!.universityId }).select("_id").lean();
    if (!match) throw new AppError(404, "Claim not found in your university.", "CLAIM_NOT_FOUND");
    const key = claim.proofKeys?.[index];
    if (!key || !isSafeUploadKey(key, "claim-evidence")) throw new AppError(404, "Evidence not found.", "EVIDENCE_NOT_FOUND");
    const metadata = await getObjectMetadata(key);
    if (!metadata.contentType || metadata.contentLength == null || metadata.contentLength > maxUploadBytes) {
      throw new AppError(404, "Evidence not found.", "EVIDENCE_NOT_FOUND");
    }
    response.json({ data: { url: await createDownloadUrl(key, 300), expiresInSeconds: 300 } });
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
    if (claim.status !== "pending" && claim.status !== "more_evidence") {
      throw new AppError(409, "This claim already has a final decision.", "CLAIM_ALREADY_REVIEWED");
    }
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
      const handover = await Handover.findOneAndUpdate(
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
      const foundReport = await Report.findOne({ _id: match.foundReport, university: request.auth!.universityId }).select("reporter").lean();
      const recipientIds = new Set([claim.claimant.toString(), foundReport?.reporter.toString()].filter(Boolean));
      await Notification.insertMany([...recipientIds].map((user) => ({
        user,
        kind: "handover",
        title: "A handover has been scheduled",
        message: `Meet at ${handover.handoverPoint} on ${handover.scheduledFor.toISOString()}. Confirm the transfer in CampusFind after it happens.`,
        actionPath: `/handovers/${handover.id}`,
      })));
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



export default router;
