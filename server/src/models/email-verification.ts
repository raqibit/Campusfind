import { Schema, model, type InferSchemaType, Types } from "mongoose";

const registrationSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    matricNumber: { type: String, required: true, trim: true, uppercase: true },
    passwordHash: { type: String, required: true },
    university: { type: Types.ObjectId, ref: "University", required: true },
  },
  { _id: false },
);

const emailVerificationSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    purpose: { type: String, enum: ["email_verification", "password_reset"], required: true },
    codeHash: { type: String, required: true, select: false },
    registration: { type: registrationSchema, default: undefined, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true });

export type EmailVerificationDocument = InferSchemaType<typeof emailVerificationSchema>;
export const EmailVerification = model("EmailVerification", emailVerificationSchema);
