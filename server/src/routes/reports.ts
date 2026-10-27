import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Report } from "../models/report.js";
import { University } from "../models/university.js";
import { getObjectMetadata, publicReportImageUrl } from "../services/object-storage.js";
import { isSafeUploadKey, maxUploadBytes } from "../services/storage-keys.js";
import { enqueueMatchingJob } from "../services/matching-queue.js";

const router = Router();
const category = z.enum(["Identity card", "Wallet", "Electronics", "Bag", "Keys", "Books", "Other"]);
const reportWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "REPORT_RATE_LIMITED", message: "Too many report changes. Please try again later." } },
});

const reportSchema = z.object({
  type: z.enum(["lost", "found"]),
  title: z.string().trim().min(3).max(100),
  category,
  publicDescription: z.string().trim().min(10).max(1000),
  privateDetails: z.string().trim().max(1000).optional(),
  attributes: z
    .object({
      colour: z.string().trim().max(50).optional(),
      brand: z.string().trim().max(80).optional(),
      model: z.string().trim().max(80).optional(),
    })
    .optional(),
  location: z.object({
    label: z.string().trim().min(2).max(150),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  happenedAt: z.coerce.date(),
  imageKeys: z.array(z.string().trim().min(1).max(500)).max(3).optional(),
  consentImageAnalysis: z.boolean().optional(),
});

function publicReport(report: Record<string, unknown>) {
  const location = report.location as { label?: string; latitude?: number; longitude?: number } | undefined;
  if (!location) return report;
  const rounded = {
    ...location,
    ...(location.latitude !== undefined ? { latitude: Math.round(location.latitude * 1000) / 1000 } : {}),
    ...(location.longitude !== undefined ? { longitude: Math.round(location.longitude * 1000) / 1000 } : {}),
  };
  return { ...report, location: rounded };
}

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const querySchema = z.object({
      universityId: z.string().min(1),
      q: z.string().trim().max(100).optional(),
      type: z.enum(["lost", "found"]).optional(),
      category: category.optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(50).default(18),
    });
    const query = querySchema.parse(request.query);
    const university = await University.findOne({ _id: query.universityId, shortName: "UI", active: true }).select("_id").lean();
    if (!university) throw new AppError(404, "CampusFind is currently available only within the University of Ibadan.", "UNIVERSITY_OUT_OF_SCOPE");
    const filter: Record<string, unknown> = {
      university: university._id,
      status: { $in: ["open", "matched", "claimed", "returned"] },
    };
    if (query.type) filter.type = query.type;
    if (query.category) filter.category = query.category;
    if (query.q) filter.$text = { $search: query.q };

    const [items, total] = await Promise.all([
      Report.find(filter)
        .select("-privateDetails -imageEmbedding -textEmbedding -imageDescriptorEmbedding -imageAnalysis -imageKeys -matchingConsentAt -textEmbeddingSourceHash")
        .populate("reporter", "fullName verified")
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Report.countDocuments(filter),
    ]);
    response.json({ data: items.map((item) => publicReport(item as unknown as Record<string, unknown>)), meta: { page: query.page, limit: query.limit, total } });
  }),
);

router.post(
  "/",
  requireAuth,
  reportWriteLimiter,
  asyncRoute(async (request, response) => {
    const input = reportSchema.parse(request.body);
    const { imageKeys: submittedImageKeys, consentImageAnalysis, ...reportFields } = input;
    const imageKeys = submittedImageKeys || [];
    const mediaMetadata = await Promise.all(imageKeys.map(async (key) => {
      if (!isSafeUploadKey(key, "report-media", request.auth!.userId)) {
        throw new AppError(403, "This photo upload does not belong to your account.", "REPORT_MEDIA_FORBIDDEN");
      }
      return getObjectMetadata(key);
    }));
    if (mediaMetadata.some((metadata) =>
      !metadata.contentType?.startsWith("image/") || !metadata.contentLength || metadata.contentLength > maxUploadBytes,
    )) {
      throw new AppError(422, "One or more report images are invalid or too large.", "INVALID_REPORT_MEDIA");
    }
    const imageUrls = imageKeys.map(publicReportImageUrl);
    const report = await Report.create({
      ...reportFields,
      imageUrls,
      imageKeys,
      matchingConsentAt: consentImageAnalysis ? new Date() : null,
      university: request.auth!.universityId,
      reporter: request.auth!.userId,
    });
    await enqueueMatchingJob(report.id);
    const safeReport = await Report.findById(report.id).select("-privateDetails -imageEmbedding -textEmbedding -imageDescriptorEmbedding -imageAnalysis -imageKeys -matchingConsentAt -textEmbeddingSourceHash").lean();
    response.status(201).json({ data: safeReport ? publicReport(safeReport as unknown as Record<string, unknown>) : null, meta: { matchesCreated: 0, matchingStatus: "queued" } });
  }),
);

router.get(
  "/:reportId",
  asyncRoute(async (request, response) => {
    const query = z.object({ universityId: z.string().min(1) }).parse(request.query);
    const university = await University.findOne({ _id: query.universityId, shortName: "UI", active: true }).select("_id").lean();
    if (!university) throw new AppError(404, "CampusFind is currently available only within the University of Ibadan.", "UNIVERSITY_OUT_OF_SCOPE");
    const report = await Report.findOne({ _id: request.params.reportId, university: university._id })
      .select("-privateDetails -imageEmbedding -textEmbedding -imageDescriptorEmbedding -imageAnalysis -imageKeys -matchingConsentAt -textEmbeddingSourceHash")
      .populate("reporter", "fullName verified")
      .lean();
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    response.json({ data: publicReport(report as unknown as Record<string, unknown>) });
  }),
);

router.patch(
  "/:reportId",
  requireAuth,
  reportWriteLimiter,
  asyncRoute(async (request, response) => {
    const input = reportSchema.partial().omit({ type: true }).parse(request.body);
    const report = await Report.findOne({ _id: request.params.reportId, university: request.auth!.universityId })
      .select("+imageKeys +matchingConsentAt +imageEmbedding +imageDescriptorEmbedding +imageDescriptorEmbeddingModel +imageAnalysis +imageAnalysisModel +textEmbedding +textEmbeddingSourceHash");
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    if (report.reporter.toString() !== request.auth!.userId && request.auth!.role !== "admin") {
      throw new AppError(403, "You cannot edit this report.", "FORBIDDEN");
    }
    const { imageKeys, consentImageAnalysis, ...fields } = input;
    Object.assign(report, fields);
    if (consentImageAnalysis !== undefined) {
      report.matchingConsentAt = consentImageAnalysis ? new Date() : null;
      if (!consentImageAnalysis) {
        report.imageEmbedding = undefined;
        report.imageDescriptorEmbedding = undefined;
        report.imageDescriptorEmbeddingModel = null;
        report.imageAnalysis = undefined;
        report.imageAnalysisModel = null;
      }
    }
    if (imageKeys !== undefined) report.matchingConsentAt = consentImageAnalysis ? new Date() : null;
    if (imageKeys) {
      const mediaMetadata = await Promise.all(imageKeys.map(async (key) => {
        if (!isSafeUploadKey(key, "report-media", request.auth!.userId)) {
          throw new AppError(403, "This photo upload does not belong to your account.", "REPORT_MEDIA_FORBIDDEN");
        }
        return getObjectMetadata(key);
      }));
      if (mediaMetadata.some((metadata) =>
        !metadata.contentType?.startsWith("image/") || !metadata.contentLength || metadata.contentLength > maxUploadBytes,
      )) {
        throw new AppError(422, "One or more report images are invalid or too large.", "INVALID_REPORT_MEDIA");
      }
      report.imageUrls = imageKeys.map(publicReportImageUrl);
      report.imageKeys = imageKeys;
      report.imageEmbedding = undefined;
      report.imageDescriptorEmbedding = undefined;
      report.imageDescriptorEmbeddingModel = null;
      report.imageAnalysis = undefined;
      report.imageAnalysisModel = null;
    }
    const textChanged = fields.title !== undefined || fields.publicDescription !== undefined || fields.attributes !== undefined || fields.category !== undefined;
    if (textChanged) {
      report.textEmbedding = undefined;
      report.textEmbeddingModel = null;
      report.textEmbeddingSourceHash = null;
    }
    await report.save();
    await enqueueMatchingJob(report.id);
    const safeReport = await Report.findById(report.id)
      .select("-privateDetails -imageEmbedding -textEmbedding -imageDescriptorEmbedding -imageAnalysis -imageKeys -matchingConsentAt -textEmbeddingSourceHash")
      .populate("reporter", "fullName verified")
      .lean();
    response.status(202).json({ data: safeReport ? publicReport(safeReport as unknown as Record<string, unknown>) : null, meta: { matchingStatus: "queued" } });
  }),
);

router.post(
  "/:reportId/rematch",
  requireAuth,
  reportWriteLimiter,
  asyncRoute(async (request, response) => {
    const reportId = String(request.params.reportId);
    const report = await Report.findOne({ _id: reportId, university: request.auth!.universityId }).lean();
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    if (report.reporter.toString() !== request.auth!.userId && request.auth!.role !== "admin") {
      throw new AppError(403, "You cannot rematch this report.", "FORBIDDEN");
    }
    await enqueueMatchingJob(reportId);
    response.status(202).json({ data: { queued: true } });
  }),
);

export default router;
