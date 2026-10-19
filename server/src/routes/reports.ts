import { Router } from "express";
import { z } from "zod";
import { asyncRoute, AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { Report } from "../models/report.js";
import { University } from "../models/university.js";
import { createImageEmbedding } from "../services/image-embedding.js";
import { attachReportImageUrls } from "../services/report-images.js";
import { createDownloadUrl, verifyUserObjects } from "../services/object-storage.js";
import { createMatchSuggestions } from "../services/matching.js";

const router = Router();
const category = z.enum(["Identity card", "Wallet", "Electronics", "Bag", "Keys", "Books", "Other"]);

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
  imageUrls: z.array(z.string().url()).max(5).default([]),
  imageKeys: z.array(z.string().min(1)).max(5).default([]),
  imageEmbedding: z.array(z.number().finite()).max(4096).optional(),
});

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
        .select("-privateDetails -imageEmbedding")
        .populate("reporter", "fullName verified")
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      Report.countDocuments(filter),
    ]);
    response.json({ data: await Promise.all(items.map(attachReportImageUrls)), meta: { page: query.page, limit: query.limit, total } });
  }),
);

router.post(
  "/",
  requireAuth,
  asyncRoute(async (request, response) => {
    const input = reportSchema.parse(request.body);
    await verifyUserObjects(input.imageKeys, "report-images", request.auth!.universityId, request.auth!.userId);
    let imageEmbedding = input.imageEmbedding;
    const imageForEmbedding = input.imageUrls[0] ?? (input.imageKeys[0] ? await createDownloadUrl(input.imageKeys[0]) : undefined);
    if (!imageEmbedding && imageForEmbedding) {
      try {
        imageEmbedding = await createImageEmbedding(imageForEmbedding);
      } catch (error) {
        console.warn("Image embedding was skipped; metadata matching will continue.", error);
      }
    }
    const report = await Report.create({
      ...input,
      imageEmbedding,
      university: request.auth!.universityId,
      reporter: request.auth!.userId,
    });
    const matches = await createMatchSuggestions(report.id);
    const safeReport = await Report.findById(report.id).select("-privateDetails -imageEmbedding").lean();
    response.status(201).json({ data: await attachReportImageUrls({ ...safeReport, imageKeys: input.imageKeys }), meta: { matchesCreated: matches.length } });
  }),
);

router.get(
  "/:reportId",
  asyncRoute(async (request, response) => {
    const query = z.object({ universityId: z.string().min(1) }).parse(request.query);
    const university = await University.findOne({ _id: query.universityId, shortName: "UI", active: true }).select("_id").lean();
    if (!university) throw new AppError(404, "CampusFind is currently available only within the University of Ibadan.", "UNIVERSITY_OUT_OF_SCOPE");
    const report = await Report.findOne({ _id: request.params.reportId, university: university._id })
      .select("-privateDetails -imageEmbedding")
      .populate("reporter", "fullName verified")
      .lean();
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    response.json({ data: await attachReportImageUrls(report) });
  }),
);

router.patch(
  "/:reportId",
  requireAuth,
  asyncRoute(async (request, response) => {
    const input = reportSchema.partial().omit({ type: true, imageEmbedding: true, imageKeys: true }).parse(request.body);
    const report = await Report.findOne({ _id: request.params.reportId, university: request.auth!.universityId });
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    if (report.reporter.toString() !== request.auth!.userId && request.auth!.role !== "admin") {
      throw new AppError(403, "You cannot edit this report.", "FORBIDDEN");
    }
    Object.assign(report, input);
    await report.save();
    response.json({ data: report });
  }),
);

router.post(
  "/:reportId/rematch",
  requireAuth,
  asyncRoute(async (request, response) => {
    const reportId = String(request.params.reportId);
    const report = await Report.findOne({ _id: reportId, university: request.auth!.universityId }).lean();
    if (!report) throw new AppError(404, "Report not found.", "REPORT_NOT_FOUND");
    if (report.reporter.toString() !== request.auth!.userId && request.auth!.role !== "admin") {
      throw new AppError(403, "You cannot rematch this report.", "FORBIDDEN");
    }
    const matches = await createMatchSuggestions(reportId);
    response.json({ data: matches });
  }),
);

export default router;
