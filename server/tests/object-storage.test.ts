import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";

process.env.JWT_SECRET = "campusfind-storage-test-secret-at-least-32-characters";
process.env.S3_ENDPOINT = "https://objects.example.test";
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = "campusfind-private";
process.env.S3_ACCESS_KEY_ID = "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
process.env.S3_FORCE_PATH_STYLE = "true";

const storage = await import("../src/services/object-storage.js");

function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}
function verifyPresignedPut(url: URL, secret: string, contentType: string) {
  const params = new URLSearchParams(url.searchParams);
  const signature = params.get("X-Amz-Signature");
  params.delete("X-Amz-Signature");
  const credential = params.get("X-Amz-Credential")!.split("/");
  const date = params.get("X-Amz-Date")!;
  const scope = credential.slice(1).join("/");
  const canonicalHeaders = `content-type:${contentType}\\nhost:${url.host}\\n`;
  const canonicalRequest = ["PUT", url.pathname, canonicalQuery(params), canonicalHeaders, "content-type;host", "UNSIGNED-PAYLOAD"].join("\\n");
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\\n");
  const dateKey = createHmac("sha256", `AWS4${secret}`).update(credential[1]!).digest();
  const regionKey = createHmac("sha256", dateKey).update(credential[2]!).digest();
  const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
  const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();
  const expected = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return signature === expected;
}


test("presigned uploads bind the expected content type and short expiry", () => {
  const key = storage.createObjectKey("report-images", "university-1", "user-1", "jpg");
  const url = new URL(storage.createUploadUrl(key, "image/jpeg"));
  assert.match(url.pathname, /^\/campusfind-private\/report-images\/university-1\/user-1\//);
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  assert.ok(url.searchParams.get("X-Amz-Signature"));
  assert.equal(verifyPresignedPut(url, "test-secret-key", "image/jpeg"), true);
});

test("private evidence download URLs are short-lived and object-specific", () => {
  const key = storage.createObjectKey("claim-evidence", "university-1", "user-1", "pdf");
  const url = new URL(storage.createDownloadUrl(key));
  assert.match(url.pathname, /claim-evidence\/university-1\/user-1\//);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
  assert.ok(url.searchParams.get("X-Amz-Signature"));
});

test("uploaded object verification checks storage metadata and enforces account ownership", async () => {
  const key = storage.createObjectKey("claim-evidence", "university-1", "user-1", "pdf");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, {
    status: 200,
    headers: { "content-type": "application/pdf", "content-length": "1024" },
  })) as typeof fetch;
  try {
    assert.equal(await storage.verifyStoredObject(key, "application/pdf", 5 * 1024 * 1024), true);
    await storage.verifyUserObjects([key], "claim-evidence", "university-1", "user-1");
    await assert.rejects(
      storage.verifyUserObjects([key], "claim-evidence", "university-2", "user-1"),
      (error: unknown) => (error as { code?: string }).code === "INVALID_OBJECT_KEY",
    );
    assert.equal(await storage.verifyStoredObject(key, "image/jpeg", 5 * 1024 * 1024), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
