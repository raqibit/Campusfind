import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { accessTokenFromRequest, assertCookieMutationIsSameSite } from "../services/auth-session.js";
import { type TokenPayload } from "../services/jwt.js";

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = accessTokenFromRequest(request);

  if (!token) {
    next(new AppError(401, "Sign in to continue.", "AUTH_REQUIRED"));
    return;
  }

  try {
    assertCookieMutationIsSameSite(request);
  } catch (error) {
    next(error);
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
