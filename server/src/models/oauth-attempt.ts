import { Schema, model, type InferSchemaType } from "mongoose";
import { Types } from "mongoose";

const oauthAttemptSchema = new Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    provider: { type: String, enum: ["google", "apple"], required: true },
    nonce: { type: String, required: true },
    linkUser: { type: Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type OAuthAttemptDocument = InferSchemaType<typeof oauthAttemptSchema>;
export const OAuthAttempt = model("OAuthAttempt", oauthAttemptSchema);
