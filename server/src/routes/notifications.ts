import { Router } from "express";
import { asyncRoute } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/notification.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const notifications = await Notification.find({ user: request.auth!.userId }).sort({ createdAt: -1 }).limit(100).lean();
    response.json({ data: notifications });
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
