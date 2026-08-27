import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Types } from "mongoose";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth, signAccessToken } from "../middleware/auth.js";
import { University } from "../models/university.js";
import { User } from "../models/user.js";

const router = Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(3).max(80),
  email: z.string().email().transform((value) => value.toLowerCase()),
  matricNumber: z.string().trim().min(4).max(30).transform((value) => value.toUpperCase()),
  password: z.string().min(8).max(128),
  universityId: z.string().refine(Types.ObjectId.isValid, "Invalid university"),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

router.get(
  "/universities",
  asyncRoute(async (_request, response) => {
    const universities = await University.find({ active: true }).select("name shortName campuses").sort({ name: 1 }).lean();
    response.json({ data: universities });
  }),
);

router.post(
  "/register",
  asyncRoute(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const university = await University.findById(input.universityId);
    if (!university?.active) throw new AppError(422, "Choose an active university.", "INVALID_UNIVERSITY");

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
      fullName: input.fullName,
      email: input.email,
      matricNumber: input.matricNumber,
      passwordHash,
      university: university._id,
      role: "student",
      verified: input.email.endsWith(`@${university.emailDomain}`),
    });
    const token = signAccessToken({ sub: user.id, universityId: university.id, role: user.role });
    response.status(201).json({
      data: {
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          matricNumber: user.matricNumber,
          role: user.role,
          verified: user.verified,
          university: { id: university.id, name: university.name, shortName: university.shortName },
        },
      },
    });
  }),
);

router.post(
  "/login",
  asyncRoute(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await User.findOne({ email: input.email }).select("+passwordHash").populate("university", "name shortName active");
    const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !passwordMatches) throw new AppError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    if (user.suspendedAt) throw new AppError(403, "This account is suspended.", "ACCOUNT_SUSPENDED");

    const university = user.university as unknown as { _id: Types.ObjectId; name: string; shortName: string; active: boolean };
    if (!university.active) throw new AppError(403, "This university workspace is inactive.", "UNIVERSITY_INACTIVE");
    const token = signAccessToken({ sub: user.id, universityId: university._id.toString(), role: user.role });
    response.json({
      data: {
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          matricNumber: user.matricNumber,
          role: user.role,
          verified: user.verified,
          university: { id: university._id, name: university.name, shortName: university.shortName },
        },
      },
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncRoute(async (request, response) => {
    const user = await User.findById(request.auth!.userId).populate("university", "name shortName").lean();
    if (!user) throw new AppError(404, "User not found.", "USER_NOT_FOUND");
    response.json({ data: user });
  }),
);

export default router;
