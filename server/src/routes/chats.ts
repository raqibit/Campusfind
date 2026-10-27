import { Router } from "express";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { Types } from "mongoose";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { ChatMessage } from "../models/chat-message.js";
import { Match } from "../models/match.js";
import { Notification } from "../models/notification.js";
import { Report } from "../models/report.js";

const router = Router();
router.use(requireAuth);

const messageLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "CHAT_RATE_LIMITED", message: "Please wait before sending another message." } },
});

const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

async function getChatParticipants(matchId: string, universityId: string) {
  if (!Types.ObjectId.isValid(matchId)) throw new AppError(404, "Match not found.", "MATCH_NOT_FOUND");
  const match = await Match.findOne({ _id: matchId, university: universityId, status: { $in: ["reviewing", "approved"] } })
    .select("lostReport foundReport status")
    .lean();
  if (!match) throw new AppError(404, "An authorised claim is required before chat is available.", "CHAT_NOT_AVAILABLE");
  const [lost, found] = await Promise.all([
    Report.findOne({ _id: match.lostReport, university: universityId }).select("reporter title"),
    Report.findOne({ _id: match.foundReport, university: universityId }).select("reporter title"),
  ]);
  if (!lost || !found) throw new AppError(404, "The reports for this case could not be found.", "REPORTS_NOT_FOUND");
  const participants = [...new Set([lost.reporter.toString(), found.reporter.toString()])];
  return { match, participants };
}

router.get(
  "/:matchId/messages",
  asyncRoute(async (request, response) => {
    const { participants } = await getChatParticipants(String(request.params.matchId), request.auth!.universityId);
    if (!participants.includes(request.auth!.userId)) throw new AppError(403, "Only the match participants can use this chat.", "FORBIDDEN");
    const query = z.object({
      after: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    const filter: Record<string, unknown> = { match: request.params.matchId };
    if (query.after) filter.createdAt = { $gt: new Date(query.after) };
    let messages = await ChatMessage.find(filter)
      .populate("sender", "fullName")
      .sort({ createdAt: query.after ? 1 : -1 })
      .limit(query.limit)
      .lean();
    if (!query.after) messages = messages.reverse();
    response.json({ data: messages });
  }),
);

router.post(
  "/:matchId/messages",
  messageLimiter,
  asyncRoute(async (request, response) => {
    const { participants } = await getChatParticipants(String(request.params.matchId), request.auth!.universityId);
    if (!participants.includes(request.auth!.userId)) throw new AppError(403, "Only the match participants can use this chat.", "FORBIDDEN");
    const input = z.object({
      body: z.string().trim().min(1).max(2000),
      clientMessageId: z.string().trim().min(8).max(64).optional(),
    }).parse(request.body);
    const clientMessageId = input.clientMessageId || randomUUID();
    if (emailPattern.test(input.body) || phonePattern.test(input.body)) {
      throw new AppError(422, "Keep email addresses and phone numbers out of chat. CampusFind will keep your contact details private.", "CONTACT_DETAILS_BLOCKED");
    }
    const message = await ChatMessage.findOneAndUpdate(
      { match: request.params.matchId, sender: request.auth!.userId, clientMessageId },
      {
        $setOnInsert: {
          match: request.params.matchId,
          sender: request.auth!.userId,
          clientMessageId,
          body: input.body,
        },
      },
      { upsert: true, new: true },
    ).populate("sender", "fullName");
    const otherParticipants = participants.filter((participant) => participant !== request.auth!.userId);
    await Promise.all(otherParticipants.map((user) => Notification.updateOne(
      { user, dedupeKey: `chat:${message.id}:${user}` },
      { $setOnInsert: {
        user,
        kind: "chat",
        title: "New message about a matched item",
        message: "A case participant sent you a private CampusFind message.",
        actionPath: `/chats/${request.params.matchId}`,
        dedupeKey: `chat:${message.id}:${user}`,
      } },
      { upsert: true },
    )));
    response.status(201).json({ data: message });
  }),
);

export default router;
