import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/campusfind"),
  JWT_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173,http://localhost:3000"),
  IMAGE_EMBEDDING_API_URL: z.string().url().optional().or(z.literal("")),
  IMAGE_EMBEDDING_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
