import { Schema, model, type InferSchemaType, Types } from "mongoose";

const chatMessageSchema = new Schema(
  {
    match: { type: Types.ObjectId, ref: "Match", required: true, index: true },
    sender: { type: Types.ObjectId, ref: "User", required: true, index: true },
    clientMessageId: { type: String, trim: true, maxlength: 64 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

chatMessageSchema.index({ match: 1, createdAt: -1 });
chatMessageSchema.index({ match: 1, sender: 1, clientMessageId: 1 }, { unique: true, sparse: true });

export type ChatMessageDocument = InferSchemaType<typeof chatMessageSchema>;
export const ChatMessage = model("ChatMessage", chatMessageSchema);
