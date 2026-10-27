import { randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { createDownloadUrl, createUploadUrl, getObjectMetadata, publicReportImageUrl, putPrivateObject } from "../services/object-storage.js";
import { isSafeUploadKey, maxUploadBytes } from "../services/storage-keys.js";

const router = Router();
const purposes = z.enum(["report-media", "claim-evidence"]);
const contentTypes = {
  "report-media": new Set(["image/jpeg", "image/png", "image/webp"]),
  "claim-evidence": new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
} as const;

function sniffContentType(buffer: Buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

router.use(requireAuth);

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "UPLOAD_RATE_LIMITED", message: "Too many uploads. Please try again later." } },
});

router.post(
  "/presign",
  uploadLimiter,
  asyncRoute(async (request, response) => {
    const input = z.object({ purpose: purposes, contentType: z.string().min(1) }).parse(request.body);
    if (!contentTypes[input.purpose].has(input.contentType as never)) {
      throw new AppError(422, "Unsupported file type for this upload.", "UNSUPPORTED_UPLOAD_TYPE");
    }
    const extension = input.contentType === "application/pdf" ? "pdf" : input.contentType.slice("image/".length);
    const key = `${input.purpose}/${request.auth!.userId}/${randomUUID()}.${extension}`;
    const uploadUrl = await createUploadUrl(key, input.contentType, 300);
    response.status(201).json({ data: { key, uploadUrl, contentType: input.contentType, maxBytes: maxUploadBytes, expiresInSeconds: 300 } });
  }),
);

router.post(
  "/",
  uploadLimiter,
  multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 } }).single("file"),
  asyncRoute(async (request, response) => {
    const purpose = purposes.parse(request.body.purpose);
    const file = request.file;
    if (!file) throw new AppError(400, "Choose a file to upload.", "UPLOAD_FILE_REQUIRED");
    const detectedType = sniffContentType(file.buffer);
    if (!detectedType || detectedType !== file.mimetype || !contentTypes[purpose].has(detectedType as never)) {
      throw new AppError(415, "This file type is not supported.", "UNSUPPORTED_UPLOAD_TYPE");
    }

    let body = file.buffer;
    let contentType = detectedType;
    let extension = detectedType === "application/pdf" ? "pdf" : detectedType.slice("image/".length);
    if (detectedType.startsWith("image/")) {
      try {
        body = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
        contentType = "image/jpeg";
        extension = "jpg";
      } catch {
        throw new AppError(415, "The image could not be decoded safely.", "INVALID_IMAGE");
      }
    }

    const key = `${purpose}/${request.auth!.userId}/${randomUUID()}.${extension}`;
    await putPrivateObject({ key, body, contentType });
    response.status(201).json({ data: { key, contentType, size: body.length, publicUrl: purpose === "report-media" ? publicReportImageUrl(key) : undefined } });
  }),
);

router.get(
  "/public",
  asyncRoute(async (request, response) => {
    const key = z.string().min(1).max(500).parse(request.query.key);
    if (!isSafeUploadKey(key, "report-media")) throw new AppError(404, "Image not found.", "MEDIA_NOT_FOUND");
    const metadata = await getObjectMetadata(key);
    if (!metadata.contentType?.startsWith("image/") || !metadata.contentLength || metadata.contentLength > maxUploadBytes) {
      throw new AppError(404, "Image not found.", "MEDIA_NOT_FOUND");
    }
    response.redirect(302, await createDownloadUrl(key, 300));
  }),
);

export default router;
