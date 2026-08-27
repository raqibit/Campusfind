import { z } from "zod";
import { env } from "../config/env.js";

const responseSchema = z.object({
  embedding: z.array(z.number().finite()).min(8).max(4096),
});

export async function createImageEmbedding(imageUrl: string) {
  if (!env.IMAGE_EMBEDDING_API_URL) return undefined;
  const response = await fetch(env.IMAGE_EMBEDDING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.IMAGE_EMBEDDING_API_KEY
        ? { Authorization: `Bearer ${env.IMAGE_EMBEDDING_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ imageUrl }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Image embedding provider returned ${response.status}`);
  return responseSchema.parse(await response.json()).embedding;
}
