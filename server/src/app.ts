import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./lib/errors.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import claimRoutes from "./routes/claims.js";
import chatRoutes from "./routes/chats.js";
import matchRoutes from "./routes/matches.js";
import handoverRoutes from "./routes/handovers.js";
import notificationRoutes from "./routes/notifications.js";
import reportRoutes from "./routes/reports.js";
import uploadRoutes from "./routes/uploads.js";

export function createApp() {
  const app = express();
  const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim());

  app.disable("x-powered-by");
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: { directives: { frameSrc: ["'self'", "https://www.openstreetmap.org"] } },
  }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  const authenticationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many account requests. Please try again shortly." } },
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "campusfind-api", time: new Date().toISOString() });
  });
  app.use("/api/auth", authenticationLimiter, authRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/matches", matchRoutes);
  app.use("/api/claims", claimRoutes);
  app.use("/api/chats", chatRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/handovers", handoverRoutes);
  app.use("/api/admin", adminRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
