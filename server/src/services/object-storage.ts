import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";

const configured = Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
const endpoint = env.S3_ENDPOINT ? new URL(env.S3_ENDPOINT) : null;

export function objectStorageConfigured() {
  return configured && Boolean(endpoint);
}

function requiredConfig() {
  if (!configured || !endpoint) {
    const error = new Error("Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
    Object.assign(error, { status: 503, code: "STORAGE_NOT_CONFIGURED" });
    throw error;
  }
  return { endpoint, bucket: env.S3_BUCKET!, accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function hmac(key: Buffer | string, value: string, encoding?: "hex") {
  return createHmac("sha256", key).update(value).digest(encoding);
}
function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}
function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
function objectUrl(key: string) {
  const { endpoint, bucket } = requiredConfig();
  const path = env.S3_FORCE_PATH_STYLE === "true"
    ? `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`
    : `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const url = new URL(endpoint.toString());
  url.pathname = `${endpoint.pathname.replace(/\/$/, "")}${path}`.replace(/\/+/g, "/");
  if (env.S3_FORCE_PATH_STYLE !== "true") url.hostname = `${bucket}.${endpoint.hostname}`;
  return url;
}
function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
function presign(method: "GET" | "PUT", key: string, contentType?: string, expiresSeconds = 300) {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = requiredConfig();
  const url = objectUrl(key);
  const now = new Date();
  const date = amzDate(now);
  const shortDate = date.slice(0, 8);
  const scope = `${shortDate}/${env.S3_REGION}/s3/aws4_request`;
  const host = url.host;
  const signedHeaders = "host";
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (env.S3_SESSION_TOKEN) params.set("X-Amz-Security-Token", env.S3_SESSION_TOKEN);
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [method, url.pathname, canonicalQuery(params), canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(secretAccessKey, shortDate, env.S3_REGION), stringToSign, "hex");
  params.set("X-Amz-Signature", signature);
  url.search = canonicalQuery(params);
  if (contentType) url.searchParams.set("content-type", contentType);
  return url.toString();
}

export function createUploadUrl(key: string, contentType: string) {
  return presign("PUT", key, contentType, 300);
}
export function createDownloadUrl(key: string) {
  return presign("GET", key, undefined, 300);
}
export function createObjectKey(scope: "report-images" | "claim-evidence", extension: string) {
  return `${scope}/${crypto.randomUUID()}.${extension}`;
}
export function publicObjectUrl(requestBase: string, key: string) {
  if (env.S3_PUBLIC_BASE_URL) return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return `${requestBase.replace(/\/$/, "")}/public/${key.split("/").map(encodeURIComponent).join("/")}`;
}
