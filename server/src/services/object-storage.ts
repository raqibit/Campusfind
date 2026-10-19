import { createHash, createHmac, randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const configured = Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

export function objectStorageConfigured() {
  return configured;
}

function requiredConfig() {
  if (!configured) {
    const error = new Error("Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
    Object.assign(error, { status: 503, code: "STORAGE_NOT_CONFIGURED" });
    throw error;
  }
  return {
    endpoint: new URL(env.S3_ENDPOINT!),
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
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
  return date.toISOString().replace(/[:-]|\\.\\d{3}/g, "");
}
function objectUrl(key: string) {
  const { endpoint, bucket } = requiredConfig();
  const cleanKey = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(endpoint.toString());
  const basePath = endpoint.pathname.replace(/\\/$/, "");
  if (env.S3_FORCE_PATH_STYLE === "true") {
    url.pathname = `${basePath}/${encodeURIComponent(bucket)}/${cleanKey}`;
  } else {
    url.hostname = `${bucket}.${endpoint.hostname}`;
    url.pathname = `${basePath}/${cleanKey}`;
  }
  return url;
}
function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
function presign(method: "GET" | "PUT" | "HEAD", key: string, contentType?: string, expiresSeconds = 300) {
  const { accessKeyId, secretAccessKey } = requiredConfig();
  const url = objectUrl(key);
  const now = new Date();
  const date = amzDate(now);
  const shortDate = date.slice(0, 8);
  const scope = `${shortDate}/${env.S3_REGION}/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (env.S3_SESSION_TOKEN) params.set("X-Amz-Security-Token", env.S3_SESSION_TOKEN);
  const canonicalHeaders = contentType ? `content-type:${contentType.trim()}\\nhost:${url.host}\\n` : `host:${url.host}\\n`;
  const canonicalRequest = [method, url.pathname, canonicalQuery(params), canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\\n");
  const signature = hmac(signingKey(secretAccessKey, shortDate, env.S3_REGION), stringToSign, "hex");
  params.set("X-Amz-Signature", signature);
  url.search = canonicalQuery(params);
  return url.toString();
}

export function createUploadUrl(key: string, contentType: string) {
  return presign("PUT", key, contentType, 300);
}
export function createDownloadUrl(key: string) {
  return presign("GET", key, undefined, 300);
}
export function createHeadUrl(key: string) {
  return presign("HEAD", key, undefined, 60);
}
export async function verifyStoredObject(key: string, expectedContentType: string, maxBytes: number) {
  const url = createHeadUrl(key);
  let response: Response;
  try {
    response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const length = Number(response.headers.get("content-length"));
  return contentType === expectedContentType.toLowerCase() && Number.isFinite(length) && length > 0 && length <= maxBytes;
}
export function createObjectKey(scope: "report-images" | "claim-evidence", universityId: string, userId: string, extension: string) {
  return `${scope}/${universityId}/${userId}/${randomUUID()}.${extension}`;
}
export function createPublicReportImagePath(universityId: string, userId: string, filename: string) {
  return `/api/uploads/public/${encodeURIComponent(universityId)}/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`;
}

export async function verifyUserObjects(
  keys: string[],
  scope: "report-images" | "claim-evidence",
  universityId: string,
  userId: string,
) {
  const maxCount = 5;
  if (keys.length > maxCount) {
    const error = new Error("A maximum of five files is allowed.");
    Object.assign(error, { status: 422, code: "TOO_MANY_FILES" });
    throw error;
  }
  for (const key of keys) {
    const segments = key.split("/");
    const filename = segments[3] ?? "";
    if (segments.length !== 4 || segments[0] !== scope || segments[1] !== universityId || segments[2] !== userId || !/^[a-f0-9-]+\\.(jpg|png|webp|pdf)$/i.test(filename)) {
      const error = new Error("An uploaded file does not belong to this account or file category.");
      Object.assign(error, { status: 403, code: "INVALID_OBJECT_KEY" });
      throw error;
    }
    const extension = filename.split(".").at(-1)?.toLowerCase();
    const type = extension === "jpg" || extension === "jpeg" ? "image/jpeg"
      : extension === "png" ? "image/png"
      : extension === "webp" ? "image/webp"
      : extension === "pdf" ? "application/pdf" : null;
    const allowed = scope === "report-images" ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const maxBytes = type === "application/pdf" ? 5 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!type || !allowed.includes(type) || !(await verifyStoredObject(key, type, maxBytes))) {
      const error = new Error("An uploaded file is missing, invalid, or exceeds its size limit. Upload it again.");
      Object.assign(error, { status: 422, code: "INVALID_UPLOAD" });
      throw error;
    }
  }
}
