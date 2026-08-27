import { Schema, model, type InferSchemaType } from "mongoose";

const universitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true, uppercase: true },
    emailDomain: { type: String, required: true, trim: true, lowercase: true },
    campuses: [{ type: String, trim: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

universitySchema.index({ shortName: 1 }, { unique: true });
universitySchema.index({ emailDomain: 1 }, { unique: true });

export type UniversityDocument = InferSchemaType<typeof universitySchema>;
export const University = model("University", universitySchema);
