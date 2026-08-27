import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  universityId: string;
  role: "student" | "finder" | "admin";
}

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    next(new AppError(401, "Sign in to continue.", "AUTH_REQUIRED"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    request.auth = {
      userId: payload.sub,
      universityId: payload.universityId,
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError(401, "Your session has expired. Please sign in again.", "INVALID_TOKEN"));
  }
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (request.auth?.role !== "admin") {
    next(new AppError(403, "Administrator access is required.", "FORBIDDEN"));
    return;
  }
  next();
}
