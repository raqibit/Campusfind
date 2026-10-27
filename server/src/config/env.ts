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
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o-mini"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:5000"),
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_PUBLIC_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("campusfind"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  AUTH_CALLBACK_URL: z.string().url().optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "none", "strict"]).default("lax"),
});

export const env = schema.parse(process.env);
