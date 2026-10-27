import { Schema, model, type InferSchemaType, Types } from "mongoose";

const matchSchema = new Schema(
  {
    university: { type: Types.ObjectId, ref: "University", required: true, index: true },
    lostReport: { type: Types.ObjectId, ref: "Report", required: true },
    foundReport: { type: Types.ObjectId, ref: "Report", required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    factors: {
      image: { type: Number, min: 0, max: 100, required: true },
      text: { type: Number, min: 0, max: 100, required: true },
      attributes: { type: Number, min: 0, max: 100, required: true },
      location: { type: Number, min: 0, max: 100, required: true },
      date: { type: Number, min: 0, max: 100, required: true },
    },
    status: {
      type: String,
      enum: ["suggested", "reviewing", "approved", "rejected"],
      default: "suggested",
    },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

matchSchema.index({ lostReport: 1, foundReport: 1 }, { unique: true });
matchSchema.index({ university: 1, score: -1, status: 1 });

export type MatchDocument = InferSchemaType<typeof matchSchema>;
export const Match = model("Match", matchSchema);
