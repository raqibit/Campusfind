import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Match } from "../models/match.js";
import { Report } from "../models/report.js";
import { getObjectMetadata } from "../services/object-storage.js";
import { isSafeUploadKey, maxUploadBytes } from "../services/storage-keys.js";

const router = Router();
router.use(requireAuth);

const claimSchema = z.object({
  matchId: z.string().min(1),
  privateDetail: z.string().trim().min(10).max(1500),
  proofKeys: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
  proofUrls: z.array(z.string().url()).max(0).default([]),
});

router.post(
  "/",
  asyncRoute(async (request, response) => {
    const input = claimSchema.parse(request.body);
    const match = await Match.findOne({ _id: input.matchId, university: request.auth!.universityId }).lean();
    if (!match) throw new AppError(404, "Match not found.", "MATCH_NOT_FOUND");
    if (match.status === "approved" || match.status === "rejected") {
      throw new AppError(409, "This match is no longer accepting claims.", "MATCH_CLOSED");
    }
    const lostReport = await Report.findOne({ _id: match.lostReport, university: request.auth!.universityId }).select("reporter").lean();
    if (!lostReport || lostReport.reporter.toString() !== request.auth!.userId) {
      throw new AppError(403, "Only the owner of the lost report can claim this item.", "FORBIDDEN");
    }
    const evidenceMetadata = await Promise.all(input.proofKeys.map(async (key) => {
      if (!isSafeUploadKey(key, "claim-evidence", request.auth!.userId)) {
        throw new AppError(403, "This evidence upload does not belong to your account.", "EVIDENCE_UPLOAD_FORBIDDEN");
      }
      return getObjectMetadata(key);
    }));
    if (evidenceMetadata.some((metadata) =>
      !metadata.contentType ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(metadata.contentType) ||
      !metadata.contentLength || metadata.contentLength > maxUploadBytes,
    )) {
      throw new AppError(422, "One or more evidence files are invalid or too large.", "INVALID_EVIDENCE_UPLOAD");
    }

    const existingClaim = await Claim.findOne({ match: match._id, claimant: request.auth!.userId })
      .select("+privateDetail +proofUrls +proofKeys +evidenceHistory +reviewNote");
    if (existingClaim) {
      if (existingClaim.status !== "more_evidence") {
        throw new AppError(409, "You already have a claim for this match.", "CLAIM_EXISTS");
      }
      existingClaim.evidenceHistory.push({
        privateDetail: existingClaim.privateDetail,
        proofUrls: existingClaim.proofUrls,
        proofKeys: existingClaim.proofKeys,
        submittedAt: existingClaim.updatedAt || existingClaim.createdAt,
      });
      existingClaim.privateDetail = input.privateDetail;
      existingClaim.proofUrls = input.proofUrls;
      existingClaim.proofKeys = input.proofKeys;
      existingClaim.status = "pending";
      existingClaim.reviewer = null;
      existingClaim.reviewedAt = null;
      existingClaim.reviewNote = undefined;
      await existingClaim.save();
      await Match.findByIdAndUpdate(match._id, { status: "reviewing" });
      response.json({ data: { id: existingClaim.id, status: existingClaim.status, createdAt: existingClaim.createdAt } });
      return;
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
      .select("-privateDetail -proofUrls +reviewNote")
      .populate({ path: "match", populate: [{ path: "lostReport", select: "title category" }, { path: "foundReport", select: "title category" }] })
      .sort({ createdAt: -1 })
      .lean();
    response.json({ data: claims });
  }),
);

export default router;
