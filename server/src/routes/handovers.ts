import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Claim } from "../models/claim.js";
import { Handover } from "../models/handover.js";
import { Match } from "../models/match.js";
import { Notification } from "../models/notification.js";
import { Report } from "../models/report.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/my",
  asyncRoute(async (request, response) => {
    const reportIds = await Report.find({ reporter: request.auth!.userId, university: request.auth!.universityId }).distinct("_id");
    const matchIds = await Match.find({
      university: request.auth!.universityId,
      $or: [{ lostReport: { $in: reportIds } }, { foundReport: { $in: reportIds } }],
    }).distinct("_id");
    const claimIds = await Claim.find({ match: { $in: matchIds }, status: "approved" }).distinct("_id");
    const handovers = await Handover.find({ claim: { $in: claimIds } })
      .populate({
        path: "claim",
        select: "claimant match status",
        populate: [
          { path: "claimant", select: "fullName" },
          {
            path: "match",
            select: "lostReport foundReport",
            populate: [
              { path: "lostReport", select: "title category location reporter" },
              { path: "foundReport", select: "title category location reporter" },
            ],
          },
        ],
      })
      .sort({ scheduledFor: 1 })
      .lean();
    response.json({ data: handovers });
  }),
);

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

    const completedNow = Boolean(handover.finderConfirmedAt && handover.ownerConfirmedAt);
    if (completedNow) {
      handover.completedAt = new Date();
    }
    await handover.save();

    if (completedNow) {
      await Report.updateMany(
        { _id: { $in: [match.lostReport, match.foundReport] }, university: request.auth!.universityId },
        { status: "returned" },
      );
      const recipients = new Set([claim.claimant.toString(), foundReport.reporter.toString()]);
      await Notification.insertMany([...recipients].map((user) => ({
        user,
        kind: "handover",
        title: "Item return confirmed",
        message: "Both parties confirmed the handover. This case is now closed.",
        actionPath: `/handovers/${handover.id}`,
      })));
    }
    response.json({ data: { id: handover.id, finderConfirmedAt: handover.finderConfirmedAt, ownerConfirmedAt: handover.ownerConfirmedAt, completedAt: handover.completedAt } });
  }),
);

export default router;
