import { Schema, model, type InferSchemaType, Types } from "mongoose";

const userSessionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserSessionDocument = InferSchemaType<typeof userSessionSchema>;
export const UserSession = model("UserSession", userSessionSchema);
