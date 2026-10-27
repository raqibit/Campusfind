import { Schema, model, type InferSchemaType, Types } from "mongoose";

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    matricNumber: { type: String, required: true, trim: true, uppercase: true },
    passwordHash: { type: String, default: null, select: false },
    university: { type: Types.ObjectId, ref: "University", required: true },
    role: {
      type: String,
      enum: ["student", "finder", "admin"],
      default: "student",
    },
    verified: { type: Boolean, default: false },
    identities: [{
      provider: { type: String, enum: ["google", "apple"], required: true },
      subject: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
    }],
    suspendedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ university: 1, matricNumber: 1 }, { unique: true });
userSchema.index({ "identities.provider": 1, "identities.subject": 1 }, { unique: true, sparse: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
