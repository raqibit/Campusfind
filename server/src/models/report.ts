import { Schema, model, type InferSchemaType, Types } from "mongoose";

const reportSchema = new Schema(
  {
    university: { type: Types.ObjectId, ref: "University", required: true, index: true },
    reporter: { type: Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["lost", "found"], required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Identity card", "Wallet", "Electronics", "Bag", "Keys", "Books", "Other"],
      required: true,
      index: true,
    },
    publicDescription: { type: String, required: true, trim: true },
    privateDetails: { type: String, trim: true, select: false },
    attributes: {
      colour: { type: String, trim: true, lowercase: true },
      brand: { type: String, trim: true, lowercase: true },
      model: { type: String, trim: true, lowercase: true },
    },
    location: {
      label: { type: String, required: true, trim: true },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    happenedAt: { type: Date, required: true, index: true },
    imageUrls: [{ type: String, trim: true }],
    imageKeys: { type: [String], select: false, default: undefined },
    imageEmbedding: { type: [Number], select: false, default: undefined },
    imageEmbeddingModel: { type: String, trim: true, default: null, select: false },
    imageDescriptorEmbedding: { type: [Number], select: false, default: undefined },
    imageDescriptorEmbeddingModel: { type: String, trim: true, default: null, select: false },
    imageAnalysisModel: { type: String, trim: true, default: null, select: false },
    imageAnalysis: {
      type: {
        itemType: { type: String, trim: true },
        dominantColours: [{ type: String, trim: true }],
        visibleMaterials: [{ type: String, trim: true }],
        distinctiveFeatures: [{ type: String, trim: true }],
        brand: { type: String, trim: true, default: null },
        personalTextVisible: { type: Boolean, default: false },
      },
      select: false,
      default: undefined,
    },
    matchingConsentAt: { type: Date, default: null, select: false },
    textEmbedding: { type: [Number], select: false, default: undefined },
    textEmbeddingModel: { type: String, trim: true, default: null },
    textEmbeddingSourceHash: { type: String, trim: true, default: null, select: false },
    status: {
      type: String,
      enum: ["open", "matched", "claimed", "returned", "archived"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true },
);

reportSchema.index({ university: 1, type: 1, category: 1, status: 1, happenedAt: -1 });
reportSchema.index({ title: "text", publicDescription: "text", "location.label": "text" });

export type ReportDocument = InferSchemaType<typeof reportSchema>;
export const Report = model("Report", reportSchema);
