import { z } from "zod";
import { env } from "../config/env.js";

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number().finite()).min(8).max(4096) })).min(1),
});

export async function createTextEmbedding(text: string) {
  if (!env.OPENAI_API_KEY) return undefined;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: env.OPENAI_EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embedding request failed with status ${response.status}`);
  }
  const parsed = embeddingResponseSchema.parse(await response.json());
  return parsed.data[0]?.embedding;
}

export function textEmbeddingModel() {
  return env.OPENAI_API_KEY ? env.OPENAI_EMBEDDING_MODEL : undefined;
}
