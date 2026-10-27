import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/notification.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(50).default(25),
      unreadOnly: z.enum(["true", "false"]).default("false"),
    }).parse(request.query);
    const filter = { user: request.auth!.userId, ...(query.unreadOnly === "true" ? { readAt: null } : {}) };
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: request.auth!.userId, readAt: null }),
    ]);
    response.json({ data: notifications, meta: { page: query.page, limit: query.limit, total, unread } });
  }),
);

router.patch(
  "/read-all",
  asyncRoute(async (request, response) => {
    await Notification.updateMany({ user: request.auth!.userId, readAt: null }, { readAt: new Date() });
    response.status(204).end();
  }),
);

router.patch(
  "/:notificationId/read",
  asyncRoute(async (request, response) => {
    await Notification.findOneAndUpdate(
      { _id: request.params.notificationId, user: request.auth!.userId },
      { readAt: new Date() },
    );
    response.status(204).end();
  }),
);

export default router;
