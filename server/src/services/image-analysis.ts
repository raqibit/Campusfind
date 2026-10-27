import { z } from "zod";
import { env } from "../config/env.js";

const imageAnalysisSchema = z.object({
  itemType: z.string().trim().min(1).max(80),
  dominantColours: z.array(z.string().trim().max(40)).max(5),
  visibleMaterials: z.array(z.string().trim().max(40)).max(5),
  distinctiveFeatures: z.array(z.string().trim().max(120)).max(8),
  brand: z.string().trim().max(80).nullable(),
  personalTextVisible: z.boolean(),
}).strict();

const imageAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    itemType: { type: "string" },
    dominantColours: { type: "array", items: { type: "string" } },
    visibleMaterials: { type: "array", items: { type: "string" } },
    distinctiveFeatures: { type: "array", items: { type: "string" } },
    brand: { type: ["string", "null"] },
    personalTextVisible: { type: "boolean" },
  },
  required: ["itemType", "dominantColours", "visibleMaterials", "distinctiveFeatures", "brand", "personalTextVisible"],
};

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

export async function analyzeReportImage(buffer: Buffer, contentType: "image/jpeg" | "image/png" | "image/webp") {
  if (!env.OPENAI_API_KEY) return undefined;
  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Describe only broad, visible object traits useful for matching lost property. Do not read or transcribe names, card numbers, serial numbers, addresses, faces, or other personal text. Do not infer ownership. If personal text is visible, set personalTextVisible to true and omit it.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Return concise visual attributes for this item photo." },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "campusfind_visual_attributes",
          strict: true,
          schema: imageAnalysisJsonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAI image analysis failed with status ${response.status}`);
  const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI image analysis returned no structured result.");
  return imageAnalysisSchema.parse(JSON.parse(content));
}
