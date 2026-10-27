import { Schema, model, type InferSchemaType, Types } from "mongoose";

const matchingJobSchema = new Schema(
  {
    report: { type: Types.ObjectId, ref: "Report", required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true },
);

matchingJobSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });

export type MatchingJobDocument = InferSchemaType<typeof matchingJobSchema>;
export const MatchingJob = model("MatchingJob", matchingJobSchema);
