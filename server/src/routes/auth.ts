import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Types } from "mongoose";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { EmailVerification } from "../models/email-verification.js";
import { OAuthAttempt } from "../models/oauth-attempt.js";
import { University } from "../models/university.js";
import { UserSession } from "../models/user-session.js";
import { User } from "../models/user.js";
import { env } from "../config/env.js";
import { assertCookieMutationIsSameSite, clearOAuthStateCookie, createLoginSession, getCookie, revokeLoginSession, rotateLoginSession, setOAuthStateCookie } from "../services/auth-session.js";
import { sendVerificationCode } from "../services/email.js";
import { verifyProviderIdToken, exchangeOAuthCode, providerAuthorizationUrl, type OAuthProvider } from "../services/oauth.js";

const router = Router();
const providerSchema = z.enum(["google", "apple"]);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "LOGIN_RATE_LIMITED", message: "Too many sign-in attempts. Please try again later." } },
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RESET_RATE_LIMITED", message: "Too many password reset attempts. Please try again later." } },
});
const registerSchema = z.object({
  fullName: z.string().trim().min(3).max(80),
  email: z.string().email().transform((value) => value.toLowerCase()),
  matricNumber: z.string().trim().min(4).max(30).transform((value) => value.toUpperCase()),
  password: z.string().min(8).max(128),
  universityId: z.string().refine(Types.ObjectId.isValid, "Invalid university"),
});
const loginSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(1) });
const emailSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) });

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashVerificationCode(code: string) {
  return createHmac("sha256", env.JWT_SECRET).update(code).digest("hex");
}

function makeCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function issueEmailCode(email: string, purpose: "email_verification" | "password_reset", options: {
  userId?: string;
  registration?: { fullName: string; matricNumber: string; passwordHash: string; university: Types.ObjectId };
} = {}) {
  const code = makeCode();
  await EmailVerification.findOneAndUpdate(
    { email, purpose },
    { $set: {
      email,
      purpose,
      user: options.userId || null,
      registration: options.registration,
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(Date.now() + 15 * 60_000),
      attempts: 0,
      consumedAt: null,
    }, ...(options.registration ? {} : { $unset: { registration: 1 } }) },
    { upsert: true, new: true },
  );
  await sendVerificationCode(email, code, purpose);
}

function safeUser(user: {
  id?: string;
  _id?: Types.ObjectId | string;
  fullName: string;
  email: string;
  matricNumber: string;
  role: "student" | "finder" | "admin";
  verified: boolean;
  identities?: { provider: string }[];
}, university: { _id: Types.ObjectId; name: string; shortName: string }) {
  return {
    id: user.id || user._id?.toString() || "",
    fullName: user.fullName,
    email: user.email,
    matricNumber: user.matricNumber,
    role: user.role,
    verified: user.verified,
    linkedProviders: [...new Set(user.identities?.map((identity) => identity.provider) || [])],
    university: { id: university._id.toString(), name: university.name, shortName: university.shortName },
  };
}

async function respondWithSession(user: InstanceType<typeof User>, university: { _id: Types.ObjectId; name: string; shortName: string; active?: boolean }, response: Response) {
  await createLoginSession({ id: user.id, universityId: university._id.toString(), role: user.role }, response as never);
  response.json({ data: { user: safeUser(user, university) } });
}

router.get(
  "/universities",
  asyncRoute(async (_request, response) => {
    const universities = await University.find({ active: true, shortName: "UI" }).select("name shortName campuses").sort({ name: 1 }).lean();
    response.json({ data: universities });
  }),
);

router.post(
  "/register",
  asyncRoute(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const university = await University.findOne({ _id: input.universityId, shortName: "UI", active: true });
    if (!university) throw new AppError(422, "CampusFind registration is currently limited to the University of Ibadan.", "INVALID_UNIVERSITY");
    if (!input.email.endsWith(`@${university.emailDomain}`)) {
      throw new AppError(422, `Use your verified @${university.emailDomain} school email to register.`, "SCHOOL_EMAIL_REQUIRED");
    }
    const existing = await User.findOne({ email: input.email });
    if (existing?.verified) throw new AppError(409, "An account with this email already exists.", "EMAIL_ALREADY_REGISTERED");
    const passwordHash = await bcrypt.hash(input.password, 12);
    await issueEmailCode(input.email, "email_verification", {
      userId: existing?.id,
      registration: { fullName: input.fullName, matricNumber: input.matricNumber, passwordHash, university: university._id },
    });
    response.status(201).json({ data: { verificationRequired: true, email: input.email } });
  }),
);

router.post(
  "/verify-email",
  asyncRoute(async (request, response) => {
    const input = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    let user = await User.findOne({ email: input.email }).select("+passwordHash");
    if (user?.verified) throw new AppError(400, "This verification code is invalid or expired.", "INVALID_VERIFICATION_CODE");
    const verification = await EmailVerification.findOne({ email: input.email, purpose: "email_verification", consumedAt: null, expiresAt: { $gt: new Date() } })
      .select("+codeHash +registration");
    if (!verification || verification.attempts >= 5) throw new AppError(400, "This verification code is invalid or expired.", "INVALID_VERIFICATION_CODE");
    const supplied = Buffer.from(hashVerificationCode(input.code), "hex");
    const expected = Buffer.from(verification.codeHash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      verification.attempts += 1;
      await verification.save();
      throw new AppError(400, "This verification code is invalid or expired.", "INVALID_VERIFICATION_CODE");
    }
    if (verification.registration) {
      if (!user) {
        user = await User.create({
          fullName: verification.registration.fullName,
          email: input.email,
          matricNumber: verification.registration.matricNumber,
          passwordHash: verification.registration.passwordHash,
          university: verification.registration.university,
          role: "student",
          verified: true,
        });
      } else {
        user.fullName = verification.registration.fullName;
        user.matricNumber = verification.registration.matricNumber;
        user.passwordHash = verification.registration.passwordHash;
        user.university = verification.registration.university;
        user.verified = true;
      }
    } else if (!user) {
      throw new AppError(400, "This verification code is invalid or expired.", "INVALID_VERIFICATION_CODE");
    } else {
      user.verified = true;
    }
    await user.save();
    await EmailVerification.deleteOne({ _id: verification._id });
    await user.populate("university", "name shortName active");
    const university = user.university as unknown as { _id: Types.ObjectId; name: string; shortName: string; active: boolean };
    if (!university.active) throw new AppError(403, "This university workspace is inactive.", "UNIVERSITY_INACTIVE");
    await respondWithSession(user, university, response);
  }),
);

router.post(
  "/resend-verification",
  asyncRoute(async (request, response) => {
    const input = emailSchema.parse(request.body);
    const user = await User.findOne({ email: input.email });
    const pendingVerification = await EmailVerification.findOne({ email: input.email, purpose: "email_verification" }).select("+registration user updatedAt");
    if (pendingVerification && Date.now() - pendingVerification.updatedAt.getTime() >= 60_000) {
      await issueEmailCode(input.email, "email_verification", {
        userId: pendingVerification.user?.toString() || undefined,
        registration: pendingVerification.registration as { fullName: string; matricNumber: string; passwordHash: string; university: Types.ObjectId } | undefined,
      });
    } else if (user && !user.verified && !pendingVerification) {
      await issueEmailCode(user.email, "email_verification", { userId: user.id });
    }
    response.json({ data: { accepted: true } });
  }),
);

router.post(
  "/login",
  loginLimiter,
  asyncRoute(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await User.findOne({ email: input.email }).select("+passwordHash").populate("university", "name shortName active");
    const passwordMatches = user?.passwordHash ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !passwordMatches) throw new AppError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    if (user.suspendedAt) throw new AppError(403, "This account is suspended.", "ACCOUNT_SUSPENDED");
    if (!user.verified) throw new AppError(403, "Verify your school email before signing in.", "EMAIL_NOT_VERIFIED");
    const university = user.university as unknown as { _id: Types.ObjectId; name: string; shortName: string; active: boolean };
    if (!university.active) throw new AppError(403, "This university workspace is inactive.", "UNIVERSITY_INACTIVE");
    if (university.shortName !== "UI") throw new AppError(403, "CampusFind is currently available only within the University of Ibadan.", "UNIVERSITY_OUT_OF_SCOPE");
    await respondWithSession(user, university, response);
  }),
);

router.post(
  "/password-reset/request",
  resetLimiter,
  asyncRoute(async (request, response) => {
    const input = emailSchema.parse(request.body);
    const user = await User.findOne({ email: input.email, verified: true });
    if (user?.passwordHash) await issueEmailCode(user.email, "password_reset", { userId: user.id });
    response.json({ data: { accepted: true } });
  }),
);

router.post(
  "/password-reset/confirm",
  resetLimiter,
  asyncRoute(async (request, response) => {
    const input = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128) }).parse(request.body);
    const user = await User.findOne({ email: input.email }).select("+passwordHash");
    const verification = user && await EmailVerification.findOne({ email: input.email, purpose: "password_reset", consumedAt: null, expiresAt: { $gt: new Date() } }).select("+codeHash");
    if (!user || !verification || verification.attempts >= 5) throw new AppError(400, "This reset code is invalid or expired.", "INVALID_RESET_CODE");
    const supplied = Buffer.from(hashVerificationCode(input.code), "hex");
    const expected = Buffer.from(verification.codeHash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      verification.attempts += 1;
      await verification.save();
      throw new AppError(400, "This reset code is invalid or expired.", "INVALID_RESET_CODE");
    }
    user.passwordHash = await bcrypt.hash(input.password, 12);
    await user.save();
    await Promise.all([
      EmailVerification.deleteOne({ _id: verification._id }),
      UserSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() }),
    ]);
    response.json({ data: { updated: true } });
  }),
);

router.post(
  "/refresh",
  asyncRoute(async (request, response) => {
    assertCookieMutationIsSameSite(request);
    await rotateLoginSession(request, response);
    response.status(204).end();
  }),
);

router.post(
  "/logout",
  asyncRoute(async (request, response) => {
    assertCookieMutationIsSameSite(request);
    await revokeLoginSession(request, response);
    response.status(204).end();
  }),
);

router.post(
  "/oauth/:provider/start",
  asyncRoute(async (request, response) => {
    const provider = providerSchema.parse(request.params.provider) as OAuthProvider;
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    await OAuthAttempt.create({ stateHash: hash(state), provider, nonce, expiresAt: new Date(Date.now() + 10 * 60_000) });
    setOAuthStateCookie(response, provider, state);
    response.json({ data: { url: providerAuthorizationUrl(provider, state, nonce) } });
  }),
);

router.post(
  "/oauth/:provider/link",
  requireAuth,
  asyncRoute(async (request, response) => {
    const provider = providerSchema.parse(request.params.provider) as OAuthProvider;
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    await OAuthAttempt.create({ stateHash: hash(state), provider, nonce, linkUser: request.auth!.userId, expiresAt: new Date(Date.now() + 10 * 60_000) });
    setOAuthStateCookie(response, provider, state);
    response.json({ data: { url: providerAuthorizationUrl(provider, state, nonce) } });
  }),
);

async function handleOAuthCallback(request: Request, response: Response) {
  const provider = providerSchema.parse(request.params.provider) as OAuthProvider;
  const data = request.method === "POST" ? request.body : request.query;
  const state = typeof data.state === "string" ? data.state : "";
  const code = typeof data.code === "string" ? data.code : "";
  const browserState = getCookie(request, `campusfind_oauth_${provider}`);
  clearOAuthStateCookie(response, provider);
  if (!state || !code || !browserState || state !== browserState) {
    throw new AppError(400, "The sign-in request could not be verified. Please try again.", "OAUTH_STATE_INVALID");
  }
  const attempt = await OAuthAttempt.findOneAndUpdate(
    { stateHash: hash(state), provider, usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
    { new: true },
  );
  if (!attempt) throw new AppError(400, "The sign-in request expired. Please try again.", "OAUTH_STATE_EXPIRED");
  const idToken = await exchangeOAuthCode(provider, code);
  const identity = await verifyProviderIdToken(provider, idToken, attempt.nonce);
  let user = await User.findOne({ identities: { $elemMatch: { provider, subject: identity.subject } } }).populate("university", "name shortName active");

  if (attempt.linkUser) {
    const target = await User.findById(attempt.linkUser).populate("university", "name shortName active");
    if (!target || target.suspendedAt) throw new AppError(404, "The CampusFind account could not be found.", "USER_NOT_FOUND");
    if (user && user.id !== target.id) throw new AppError(409, "This provider account is linked to a different CampusFind account.", "OAUTH_IDENTITY_IN_USE");
    if (!target.identities.some((item) => item.provider === provider && item.subject === identity.subject)) {
      target.identities.push({ provider, subject: identity.subject, email: identity.email });
      await target.save();
    }
    user = target;
  } else if (!user) {
    if (!identity.email || !identity.emailVerified) {
      response.redirect(`${env.CLIENT_ORIGIN.split(",")[0]}?oauthError=account_not_found`);
      return;
    }
    const emailUser = await User.findOne({ email: identity.email, verified: true }).populate("university", "name shortName active");
    if (!emailUser) {
      response.redirect(`${env.CLIENT_ORIGIN.split(",")[0]}?oauthError=account_not_found`);
      return;
    }
    emailUser.identities.push({ provider, subject: identity.subject, email: identity.email });
    await emailUser.save();
    user = emailUser;
  }

  if (!user || user.suspendedAt) throw new AppError(403, "This CampusFind account is unavailable.", "ACCOUNT_SUSPENDED");
  if (!user.verified) throw new AppError(403, "Verify your school email before signing in.", "EMAIL_NOT_VERIFIED");
  const university = user.university as unknown as { _id: Types.ObjectId; name: string; shortName: string; active: boolean };
  if (!university.active || university.shortName !== "UI") throw new AppError(403, "CampusFind is currently available only within the University of Ibadan.", "UNIVERSITY_OUT_OF_SCOPE");
  await createLoginSession({ id: user.id, universityId: university._id.toString(), role: user.role }, response);
  response.redirect(`${env.CLIENT_ORIGIN.split(",")[0]}?oauth=success`);
}

router.get("/oauth/:provider/callback", asyncRoute(handleOAuthCallback));
router.post("/oauth/:provider/callback", asyncRoute(handleOAuthCallback));

router.get(
  "/me",
  requireAuth,
  asyncRoute(async (request, response) => {
    const user = await User.findById(request.auth!.userId).populate("university", "name shortName").lean();
    if (!user) throw new AppError(404, "User not found.", "USER_NOT_FOUND");
    const university = user.university as unknown as { _id: Types.ObjectId; name: string; shortName: string };
    response.json({ data: { user: safeUser(user, university) } });
  }),
);

export default router;
