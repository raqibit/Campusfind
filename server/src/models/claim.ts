import { Schema, model, type InferSchemaType, Types } from "mongoose";

const claimSchema = new Schema(
  {
    match: { type: Types.ObjectId, ref: "Match", required: true, index: true },
    claimant: { type: Types.ObjectId, ref: "User", required: true, index: true },
    privateDetail: { type: String, required: true, trim: true, select: false },
    proofUrls: [{ type: String, trim: true, select: false }],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "more_evidence"],
      default: "pending",
      index: true,
    },
    reviewer: { type: Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, trim: true, select: false },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

claimSchema.index({ match: 1, claimant: 1 }, { unique: true });

export type ClaimDocument = InferSchemaType<typeof claimSchema>;
export const Claim = model("Claim", claimSchema);
