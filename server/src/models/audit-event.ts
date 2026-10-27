import { Schema, model, type InferSchemaType, Types } from "mongoose";

const auditEventSchema = new Schema(
  {
    university: { type: Types.ObjectId, ref: "University", required: true, index: true },
    actor: { type: Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: undefined },
    ipAddress: { type: String, trim: true },
  },
  { timestamps: true },
);

auditEventSchema.index({ university: 1, createdAt: -1 });

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;
export const AuditEvent = model("AuditEvent", auditEventSchema);
