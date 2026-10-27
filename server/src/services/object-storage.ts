import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

const bucket = env.S3_BUCKET;
const region = env.S3_REGION;
const credentials = env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
  ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
  : undefined;

const internalClient = new S3Client({
  region,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials,
});

const publicSigner = new S3Client({
  region,
  endpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials,
});

let bucketSetup: Promise<void> | null = null;

export async function ensureStorageBucket() {
  if (env.NODE_ENV === "production") return;
  if (!bucketSetup) {
    bucketSetup = internalClient.send(new CreateBucketCommand({ Bucket: bucket }))
      .then(() => undefined)
      .catch((error: unknown) => {
        const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
        const status = error && typeof error === "object" && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
        if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists" || status === 409) return;
        bucketSetup = null;
        throw error;
      });
  }
  await bucketSetup;
}

export async function putPrivateObject(input: { key: string; body: Buffer; contentType: string }) {
  await ensureStorageBucket();
  await internalClient.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    CacheControl: "private, no-store",
  }));
}

export async function getObjectMetadata(key: string) {
  await ensureStorageBucket();
  const result = await internalClient.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { contentType: result.ContentType, contentLength: result.ContentLength };
}

export async function getPrivateObjectBuffer(key: string) {
  await ensureStorageBucket();
  const result = await internalClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("Stored object has no body.");
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function createUploadUrl(key: string, contentType: string, expiresInSeconds = 300) {
  await ensureStorageBucket();
  return getSignedUrl(publicSigner, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: expiresInSeconds });
}

export async function createDownloadUrl(key: string, expiresInSeconds = 300) {
  await ensureStorageBucket();
  return getSignedUrl(publicSigner, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}

export function publicReportImageUrl(key: string) {
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");
  return `${base}/api/uploads/public?key=${encodeURIComponent(key)}`;
}
