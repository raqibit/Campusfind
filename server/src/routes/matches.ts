import { Router } from "express";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Match } from "../models/match.js";
import { Report } from "../models/report.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/my",
  asyncRoute(async (request, response) => {
    const reportIds = await Report.find({ reporter: request.auth!.userId }).distinct("_id");
    const matches = await Match.find({
      $or: [{ lostReport: { $in: reportIds } }, { foundReport: { $in: reportIds } }],
      status: { $ne: "rejected" },
    })
      .populate("lostReport", "title category publicDescription location happenedAt imageUrls reporter status")
      .populate("foundReport", "title category publicDescription location happenedAt imageUrls reporter status")
      .sort({ score: -1, createdAt: -1 })
      .lean();
    response.json({ data: matches });
  }),
);

router.get(
  "/:matchId",
  asyncRoute(async (request, response) => {
    const match = await Match.findById(request.params.matchId)
      .populate("lostReport", "title category publicDescription location happenedAt imageUrls reporter status")
      .populate("foundReport", "title category publicDescription location happenedAt imageUrls reporter status")
      .lean();
    if (!match) throw new AppError(404, "Match not found.", "MATCH_NOT_FOUND");
    const lost = match.lostReport as unknown as { reporter: { toString(): string } };
    const found = match.foundReport as unknown as { reporter: { toString(): string } };
    const participant = [lost.reporter.toString(), found.reporter.toString()].includes(request.auth!.userId);
    if (!participant && request.auth!.role !== "admin") throw new AppError(403, "You cannot view this match.", "FORBIDDEN");
    response.json({ data: match });
  }),
);

export default router;
