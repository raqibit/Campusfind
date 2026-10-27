import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  universityId: string;
  role: "student" | "finder" | "admin";
}

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}
