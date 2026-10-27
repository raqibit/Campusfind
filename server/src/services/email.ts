import nodemailer from "nodemailer";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";

export async function sendVerificationCode(email: string, code: string, purpose: "email_verification" | "password_reset") {
  if (!env.SMTP_HOST || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "development") {
      console.info(`[CampusFind local ${purpose} code] ${email}: ${code}`);
      return;
    }
    throw new AppError(503, "Email delivery is not configured. Please try again later.", "EMAIL_DELIVERY_UNAVAILABLE");
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
  });
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject: purpose === "email_verification" ? "Verify your CampusFind email" : "Reset your CampusFind password",
    text: purpose === "email_verification"
      ? `Your CampusFind verification code is ${code}. It expires in 15 minutes.`
      : `Your CampusFind password reset code is ${code}. It expires in 15 minutes. If you did not request this, ignore this message.`,
  });
}
