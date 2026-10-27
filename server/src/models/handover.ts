import { Schema, model, type InferSchemaType, Types } from "mongoose";

const handoverSchema = new Schema(
  {
    claim: { type: Types.ObjectId, ref: "Claim", required: true, unique: true },
    handoverPoint: { type: String, required: true, trim: true },
    scheduledFor: { type: Date, required: true },
    finderConfirmedAt: { type: Date, default: null },
    ownerConfirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    auditCode: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export type HandoverDocument = InferSchemaType<typeof handoverSchema>;
export const Handover = model("Handover", handoverSchema);
