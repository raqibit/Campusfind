#!/usr/bin/env node
/**
 * Live S3-compatible storage smoke test for CampusFind (MinIO recommended).
 *
 * Required environment variables:
 *   CAMPUSFIND_API_URL         API base URL ending in /api
 *   CAMPUSFIND_CLAIMANT_TOKEN  Token for the owner of the lost report in MATCH_ID
 *   CAMPUSFIND_ADMIN_TOKEN     Same-university administrator token
 *   CAMPUSFIND_MATCH_ID        Fresh match ID whose lost report belongs to claimant
 *
 * Tokens and signed URLs are intentionally never printed.
 */
import assert from "node:assert/strict";

const required = [
  "CAMPUSFIND_API_URL",
  "CAMPUSFIND_CLAIMANT_TOKEN",
  "CAMPUSFIND_ADMIN_TOKEN",
  "CAMPUSFIND_MATCH_ID",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error("Missing required environment variable: " + name);
    process.exit(2);
  }
}

const apiBase = process.env.CAMPUSFIND_API_URL.replace(/\/+$/, "");
const claimantToken = process.env.CAMPUSFIND_CLAIMANT_TOKEN;
const adminToken = process.env.CAMPUSFIND_ADMIN_TOKEN;
const matchId = process.env.CAMPUSFIND_MATCH_ID;
const testPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

async function request(path, options = {}) {
  const response = await fetch(apiBase + path, {
    ...options,
    headers: { ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  let body = null;
  const text = await response.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { response, body };
}
async function api(path, token, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = "Bearer " + token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return request(path, { ...options, headers });
}
function assertStatus(actual, expected, stage) {
  assert.equal(actual, expected, stage + ": expected HTTP " + expected + ", received " + actual);
}
async function main() {
  console.log("1/5 Requesting short-lived private-evidence upload URL…");
  const presign = await api("/uploads/presign", claimantToken, {
    method: "POST",
    body: JSON.stringify({ purpose: "claim-evidence", contentType: "application/pdf" }),
  });
  assertStatus(presign.response.status, 201, "presign upload");
  const { key, uploadUrl, contentType, maxBytes, expiresInSeconds } = presign.body?.data ?? {};
  assert.ok(typeof key === "string" && key.startsWith("claim-evidence/"), "server must issue a private evidence key");
  assert.equal(contentType, "application/pdf");
  assert.ok(testPdf.length <= maxBytes, "test fixture must be within upload limit");
  assert.equal(expiresInSeconds, 300);
  const signedUpload = new URL(uploadUrl);
  assert.ok(signedUpload.protocol === "http:" || signedUpload.protocol === "https:", "upload URL must use HTTP or HTTPS");
  if (signedUpload.protocol === "http:") assert.ok(["localhost", "127.0.0.1", "minio"].includes(signedUpload.hostname), "plain HTTP is allowed only for local MinIO endpoints");
  assert.ok(signedUpload.pathname.includes("/claim-evidence/"), "upload URL must target the private evidence prefix");

  console.log("2/5 Uploading a small PDF directly to MinIO…");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: testPdf,
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(upload.ok, "object-store PUT failed with HTTP " + upload.status);
  console.log("   Upload accepted.");

  console.log("3/5 Asking the API to verify stored metadata and attach the evidence to a claim…");
  const claimResult = await api("/claims", claimantToken, {
    method: "POST",
    body: JSON.stringify({
      matchId,
      privateDetail: "Automated storage smoke test evidence; do not use for a real ownership decision.",
      proofKeys: [key],
      proofUrls: [],
    }),
  });
  assertStatus(claimResult.response.status, 201, "claim creation and storage metadata verification");
  const claimId = claimResult.body?.data?.id;
  assert.ok(claimId, "API should return the created claim ID");
  console.log("   API accepted the object after its signed HEAD metadata check.");

  console.log("4/5 Checking that private evidence cannot be accessed without authorisation…");
  const anonymous = await api("/admin/claims/" + claimId + "/evidence/0", null);
  assertStatus(anonymous.response.status, 401, "anonymous evidence access");
  const claimant = await api("/admin/claims/" + claimId + "/evidence/0", claimantToken);
  assertStatus(claimant.response.status, 403, "student evidence access");
  console.log("   Anonymous access returned 401; student access returned 403.");

  console.log("5/5 Verifying authorised administrator download and byte integrity…");
  const evidence = await api("/admin/claims/" + claimId + "/evidence/0", adminToken);
  assertStatus(evidence.response.status, 200, "administrator evidence URL");
  assert.equal(evidence.body?.data?.expiresInSeconds, 300);
  const downloadUrl = evidence.body?.data?.url;
  assert.ok(downloadUrl, "administrator should receive a temporary download URL");
  const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(15000) });
  assertStatus(download.status, 200, "authorised evidence download");
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.deepEqual(downloaded, testPdf, "downloaded evidence bytes must match the uploaded file");
  console.log("PASS: upload, metadata verification, private-access denial, authorised download and byte integrity.");
  console.log("Claim ID created by this test: " + claimId);
  console.log("Note: this test claim remains in MongoDB; use a fresh MATCH_ID for each run.");
}

main().catch((error) => {
  console.error("FAIL: " + (error instanceof Error ? error.message : "unexpected error"));
  process.exitCode = 1;
});
