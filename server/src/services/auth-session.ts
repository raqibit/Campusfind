import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { UserSession } from "../models/user-session.js";
import { User } from "../models/user.js";
import { env } from "../config/env.js";
import { signAccessToken } from "./jwt.js";

const accessCookie = "campusfind_access";
const refreshCookie = "campusfind_refresh";
const refreshDays = 30;

function cookieValue(request: Request, name: string) {
  const raw = request.header("cookie") || "";
  const entry = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
}

function cookieOptions(path: string, maxAge: number, sameSite = env.AUTH_COOKIE_SAME_SITE) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path,
    maxAge,
  } as const;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getCookie(request: Request, name: string) {
  return cookieValue(request, name);
}

export function setOAuthStateCookie(response: Response, provider: "google" | "apple", state: string) {
  response.cookie(`campusfind_oauth_${provider}`, state, cookieOptions("/api/auth/oauth", 10 * 60 * 1000, provider === "apple" ? "none" : "lax"));
}

export function clearOAuthStateCookie(response: Response, provider: "google" | "apple") {
  response.clearCookie(`campusfind_oauth_${provider}`, cookieOptions("/api/auth/oauth", 0, provider === "apple" ? "none" : "lax"));
}

export async function createLoginSession(user: { id: string; universityId: string; role: "student" | "finder" | "admin" }, response: Response) {
  const accessToken = signAccessToken({ sub: user.id, universityId: user.universityId, role: user.role });
  const refreshToken = randomBytes(48).toString("base64url");
  await UserSession.create({
    user: user.id,
    refreshTokenHash: hash(refreshToken),
    expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
  });
  response.cookie(accessCookie, accessToken, cookieOptions("/", 15 * 60 * 1000));
  response.cookie(refreshCookie, refreshToken, cookieOptions("/api/auth", refreshDays * 86_400_000));
  return accessToken;
}

export async function rotateLoginSession(request: Request, response: Response) {
  const refreshToken = cookieValue(request, refreshCookie);
  if (!refreshToken) throw new AppError(401, "Sign in to continue.", "AUTH_REQUIRED");
  const session = await UserSession.findOne({ refreshTokenHash: hash(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, "Your session has expired. Please sign in again.", "INVALID_REFRESH_TOKEN");
  const revoked = await UserSession.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { revokedAt: new Date(), lastUsedAt: new Date() },
    { new: true },
  );
  if (!revoked) throw new AppError(401, "This session has already been refreshed.", "REFRESH_TOKEN_REUSED");
  const user = await User.findById(session.user).populate("university", "_id name shortName active");
  if (!user || user.suspendedAt) throw new AppError(401, "This account cannot continue its session.", "ACCOUNT_UNAVAILABLE");
  const university = user.university as unknown as { _id: { toString(): string }; active: boolean };
  if (!university.active) throw new AppError(403, "This university workspace is inactive.", "UNIVERSITY_INACTIVE");
  return createLoginSession({ id: user.id, universityId: university._id.toString(), role: user.role }, response);
}

export async function revokeLoginSession(request: Request, response: Response) {
  const refreshToken = cookieValue(request, refreshCookie);
  if (refreshToken) await UserSession.updateOne({ refreshTokenHash: hash(refreshToken), revokedAt: null }, { revokedAt: new Date() });
  response.clearCookie(accessCookie, cookieOptions("/", 0));
  response.clearCookie(refreshCookie, cookieOptions("/api/auth", 0));
}

export function accessTokenFromRequest(request: Request) {
  const authorization = request.header("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return bearer || cookieValue(request, accessCookie);
}

export function isCookieAuthenticated(request: Request) {
  return !request.header("authorization") && Boolean(cookieValue(request, accessCookie) || cookieValue(request, refreshCookie));
}

export function assertCookieMutationIsSameSite(request: Request) {
  if (!isCookieAuthenticated(request) || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const allowed = env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim());
  const origin = request.header("origin");
  if (!origin || !allowed.includes(origin) || request.header("x-campusfind-client") !== "1") {
    throw new AppError(403, "This request could not be verified as a CampusFind action.", "CSRF_CHECK_FAILED");
  }
}
