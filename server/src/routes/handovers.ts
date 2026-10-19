import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Handover } from "../models/handover.js";
import { Match } from "../models/match.js";
import { Report } from "../models/report.js";

const router = Router();
router.use(requireAuth);

router.patch(
  "/:handoverId/confirm",
  asyncRoute(async (request, response) => {
    const input = z.object({ party: z.enum(["finder", "owner"]) }).parse(request.body);
    const handover = await Handover.findById(request.params.handoverId);
    if (!handover) throw new AppError(404, "Handover not found.", "HANDOVER_NOT_FOUND");
    if (handover.completedAt) throw new AppError(409, "This handover has already been completed.", "HANDOVER_COMPLETED");

    const claim = await Claim.findById(handover.claim).select("claimant match status");
    if (!claim || claim.status !== "approved") throw new AppError(409, "Only an approved claim can be confirmed.", "CLAIM_NOT_APPROVED");
    const match = await Match.findOne({ _id: claim.match, university: request.auth!.universityId }).select("lostReport foundReport");
    if (!match) throw new AppError(404, "Handover not found in your university.", "HANDOVER_NOT_FOUND");
    const [lostReport, foundReport] = await Promise.all([
      Report.findOne({ _id: match.lostReport, university: request.auth!.universityId }).select("reporter"),
      Report.findOne({ _id: match.foundReport, university: request.auth!.universityId }).select("reporter"),
    ]);
    if (!lostReport || !foundReport) throw new AppError(404, "The reports for this handover could not be found.", "REPORTS_NOT_FOUND");

    const expectedUser = input.party === "owner" ? claim.claimant.toString() : foundReport.reporter.toString();
    if (request.auth!.userId !== expectedUser) {
      throw new AppError(403, "Only the actual item owner or finder can provide this confirmation.", "HANDOVER_PARTICIPANT_REQUIRED");
    }

    if (input.party === "finder") {
      if (handover.finderConfirmedAt) throw new AppError(409, "The finder has already confirmed.", "ALREADY_CONFIRMED");
      handover.finderConfirmedAt = new Date();
    } else {
      if (handover.ownerConfirmedAt) throw new AppError(409, "The owner has already confirmed.", "ALREADY_CONFIRMED");
      handover.ownerConfirmedAt = new Date();
    }

    if (handover.finderConfirmedAt && handover.ownerConfirmedAt) {
      handover.completedAt = new Date();
      await Report.updateMany(
        { _id: { $in: [match.lostReport, match.foundReport] }, university: request.auth!.universityId },
        { status: "returned" },
      );
    }
    await handover.save();
    response.json({ data: { id: handover.id, finderConfirmedAt: handover.finderConfirmedAt, ownerConfirmedAt: handover.ownerConfirmedAt, completedAt: handover.completedAt } });
  }),
);

export default router;
