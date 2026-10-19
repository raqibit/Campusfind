import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Match } from "../models/match.js";
import { Report } from "../models/report.js";
import { verifyUserObjects } from "../services/object-storage.js";

const router = Router();
router.use(requireAuth);

const claimSchema = z.object({
  matchId: z.string().min(1),
  privateDetail: z.string().trim().min(10).max(1500),
  proofUrls: z.array(z.string().url()).max(5).default([]),
  proofKeys: z.array(z.string().min(1)).max(5).default([]),
});

router.post(
  "/",
  asyncRoute(async (request, response) => {
    const input = claimSchema.parse(request.body);
    await verifyUserObjects(input.proofKeys, "claim-evidence", request.auth!.universityId, request.auth!.userId);
    const match = await Match.findOne({ _id: input.matchId, university: request.auth!.universityId }).lean();
    if (!match) throw new AppError(404, "Match not found.", "MATCH_NOT_FOUND");
    if (match.status === "approved" || match.status === "rejected") {
      throw new AppError(409, "This match is no longer accepting claims.", "MATCH_CLOSED");
    }
    const lostReport = await Report.findOne({ _id: match.lostReport, university: request.auth!.universityId }).select("reporter").lean();
    if (!lostReport || lostReport.reporter.toString() !== request.auth!.userId) {
      throw new AppError(403, "Only the owner of the lost report can claim this item.", "FORBIDDEN");
    }

    const claim = await Claim.create({
      match: match._id,
      claimant: request.auth!.userId,
      privateDetail: input.privateDetail,
      proofUrls: input.proofUrls,
      proofKeys: input.proofKeys,
    });
    await Promise.all([
      Match.findByIdAndUpdate(match._id, { status: "reviewing" }),
      Report.findByIdAndUpdate(match.lostReport, { status: "claimed" }),
    ]);
    response.status(201).json({ data: { id: claim.id, status: claim.status, createdAt: claim.createdAt } });
  }),
);

router.get(
  "/my",
  asyncRoute(async (request, response) => {
    const claims = await Claim.find({ claimant: request.auth!.userId })
      .select("-privateDetail -proofUrls -reviewNote")
      .populate({ path: "match", populate: [{ path: "lostReport", select: "title category" }, { path: "foundReport", select: "title category" }] })
      .sort({ createdAt: -1 })
      .lean();
    response.json({ data: claims });
  }),
);

export default router;
