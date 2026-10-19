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
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_SESSION_TOKEN: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
});

export const env = schema.parse(process.env);
