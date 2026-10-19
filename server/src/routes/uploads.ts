import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Report } from "../models/report.js";
import { createDownloadUrl, createObjectKey, createUploadUrl, objectStorageConfigured, verifyStoredObject } from "../services/object-storage.js";

const router = Router();
const fileTypes = {
  "image/jpeg": { extension: "jpg", maxBytes: 8 * 1024 * 1024, scope: "report-images" },
  "image/png": { extension: "png", maxBytes: 8 * 1024 * 1024, scope: "report-images" },
  "image/webp": { extension: "webp", maxBytes: 8 * 1024 * 1024, scope: "report-images" },
  "application/pdf": { extension: "pdf", maxBytes: 5 * 1024 * 1024, scope: "claim-evidence" },
} as const;
type MimeType = keyof typeof fileTypes;

function expectedTypeForKey(key: string): MimeType | null {
  const extension = key.split(".").at(-1)?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "pdf") return "application/pdf";
  return null;
}

export function keyBelongsToUser(key: string, scope: "report-images" | "claim-evidence", universityId: string, userId: string) {
  return key.startsWith(`${scope}/${universityId}/${userId}/`) &&
    key.split("/").length === 4 &&
    /^[a-f0-9-]+\\.(jpg|png|webp|pdf)$/i.test(key.split("/")[3] ?? "");
}

export async function verifyUserObjects(keys: string[], scope: "report-images" | "claim-evidence", universityId: string, userId: string) {
  if (keys.length > 5) throw new AppError(422, "A maximum of five files is allowed.", "TOO_MANY_FILES");
  for (const key of keys) {
    if (!keyBelongsToUser(key, scope, universityId, userId)) {
      throw new AppError(403, "An uploaded file does not belong to this account or file category.", "INVALID_OBJECT_KEY");
    }
    const type = expectedTypeForKey(key);
    const definition = type ? fileTypes[type] : null;
    if (!type || definition.scope !== scope || !(await verifyStoredObject(key, type, definition.maxBytes))) {
      throw new AppError(422, "An uploaded file is missing, invalid, or exceeds its size limit. Upload it again.", "INVALID_UPLOAD");
    }
  }
}

router.post(
  "/presign",
  requireAuth,
  asyncRoute(async (request, response) => {
    if (!objectStorageConfigured()) throw new AppError(503, "File storage is not configured on this deployment.", "STORAGE_NOT_CONFIGURED");
    const input = z.object({
      purpose: z.enum(["report-image", "claim-evidence"]),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    }).parse(request.body);
    const definition = fileTypes[input.contentType as MimeType];
    const scope = input.purpose === "report-image" ? "report-images" : "claim-evidence";
    if (definition.scope !== scope) throw new AppError(422, "This file type is not allowed for the selected purpose.", "UNSUPPORTED_FILE_TYPE");
    const key = createObjectKey(scope, request.auth!.universityId, request.auth!.userId, definition.extension);
    response.status(201).json({
      data: {
        key,
        uploadUrl: createUploadUrl(key, input.contentType),
        contentType: input.contentType,
        maxBytes: definition.maxBytes,
        expiresInSeconds: 300,
      },
    });
  }),
);

router.get(
  "/public/:universityId/:userId/:filename",
  asyncRoute(async (request, response) => {
    const key = `report-images/${request.params.universityId}/${request.params.userId}/${request.params.filename}`;
    const exists = await Report.exists({ university: request.params.universityId, reporter: request.params.userId, imageKeys: key });
    if (!exists) throw new AppError(404, "Report image not found.", "IMAGE_NOT_FOUND");
    response.redirect(302, createDownloadUrl(key));
  }),
);

export default router;
