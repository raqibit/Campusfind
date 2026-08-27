import { Schema, model, type InferSchemaType, Types } from "mongoose";

const notificationSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["match", "claim", "handover", "system"], required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    actionPath: { type: String, trim: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;
export const Notification = model("Notification", notificationSchema);
