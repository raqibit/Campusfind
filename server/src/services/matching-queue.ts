import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { MatchingJob } from "../models/matching-job.js";
import { Report } from "../models/report.js";
import { env } from "../config/env.js";
import { createImageEmbedding } from "./image-embedding.js";
import { analyzeReportImage } from "./image-analysis.js";
import { createTextEmbedding, textEmbeddingModel } from "./openai.js";
import { createDownloadUrl, getObjectMetadata, getPrivateObjectBuffer } from "./object-storage.js";
import { createMatchSuggestions } from "./matching.js";

const maxAttempts = 5;
const staleLockMs = 2 * 60_000;

export async function enqueueMatchingJob(reportId: string) {
  await MatchingJob.findOneAndUpdate(
    { report: reportId },
    {
      $set: { status: "pending", attempts: 0, nextRunAt: new Date(), lockedAt: null, lastError: null },
      $inc: { revision: 1 },
      $setOnInsert: { report: reportId },
    },
    { upsert: true, new: true },
  );
}

function embeddingInput(report: {
  title: string;
  publicDescription: string;
  category: string;
  attributes?: { colour?: string | null; brand?: string | null; model?: string | null } | null;
  imageAnalysis?: {
    itemType?: string | null;
    dominantColours?: string[];
    visibleMaterials?: string[];
    distinctiveFeatures?: string[];
    brand?: string | null;
  } | null;
}) {
  return [
    report.title,
    report.publicDescription,
    report.category,
    report.attributes?.colour,
    report.attributes?.brand,
    report.attributes?.model,
    report.imageAnalysis?.itemType,
    report.imageAnalysis?.brand,
    ...(report.imageAnalysis?.dominantColours || []),
    ...(report.imageAnalysis?.visibleMaterials || []),
    ...(report.imageAnalysis?.distinctiveFeatures || []),
  ].filter(Boolean).join(". ");
}

async function enrichReport(reportId: string) {
  const report = await Report.findById(reportId)
    .select("+imageKeys +matchingConsentAt +imageEmbedding +imageEmbeddingModel +imageDescriptorEmbedding +imageDescriptorEmbeddingModel +imageAnalysis +imageAnalysisModel +textEmbedding +textEmbeddingSourceHash")
    .lean();
  if (!report) return;

  const update: Record<string, unknown> = {};
  if (report.matchingConsentAt && report.imageKeys?.[0]) {
    const key = report.imageKeys[0];
    const metadata = await getObjectMetadata(key);
    const contentType = metadata.contentType;
    if (env.OPENAI_API_KEY && contentType && ["image/jpeg", "image/png", "image/webp"].includes(contentType) &&
      (!report.imageAnalysis || report.imageAnalysisModel !== env.OPENAI_VISION_MODEL)) {
      try {
        const imageAnalysis = await analyzeReportImage(
          await getPrivateObjectBuffer(key),
          contentType as "image/jpeg" | "image/png" | "image/webp",
        );
        if (imageAnalysis) {
          update.imageAnalysis = imageAnalysis;
          update.imageAnalysisModel = env.OPENAI_VISION_MODEL;
        }
      } catch (error) {
        console.warn("Visual description was skipped; other match signals remain available.", error);
      }
    }
    const imageAnalysis = (update.imageAnalysis || report.imageAnalysis) as typeof report.imageAnalysis;
    if (env.OPENAI_API_KEY && imageAnalysis && report.imageDescriptorEmbeddingModel !== env.OPENAI_EMBEDDING_MODEL) {
      try {
        const imageText = [imageAnalysis.itemType, imageAnalysis.brand, ...imageAnalysis.dominantColours, ...imageAnalysis.visibleMaterials, ...imageAnalysis.distinctiveFeatures]
          .filter(Boolean)
          .join(". ");
        update.imageDescriptorEmbedding = await createTextEmbedding(imageText);
        update.imageDescriptorEmbeddingModel = update.imageDescriptorEmbedding ? env.OPENAI_EMBEDDING_MODEL : undefined;
      } catch (error) {
        console.warn("Visual descriptor embedding was skipped; other match signals remain available.", error);
      }
    }
    if (!report.imageEmbedding || report.imageEmbeddingModel !== env.IMAGE_EMBEDDING_MODEL) {
      try { update.imageEmbedding = await createImageEmbedding(await createDownloadUrl(key, 300)); }
      catch (error) { console.warn("Image-vector provider was skipped; other match signals remain available.", error); }
      if (env.IMAGE_EMBEDDING_API_URL) update.imageEmbeddingModel = env.IMAGE_EMBEDDING_MODEL;
    }
  }

  const workingReport = { ...report, ...update };
  const input = embeddingInput(workingReport);
  const sourceHash = createHash("sha256").update(input).digest("hex");
  const model = textEmbeddingModel();
  if (env.OPENAI_API_KEY && (report.textEmbeddingSourceHash !== sourceHash || report.textEmbeddingModel !== model || !report.textEmbedding?.length)) {
    try {
      update.textEmbedding = await createTextEmbedding(input);
      update.textEmbeddingModel = update.textEmbedding ? model : undefined;
      update.textEmbeddingSourceHash = update.textEmbedding ? sourceHash : undefined;
    } catch (error) {
      console.warn("Text embedding was skipped; token matching remains available.", error);
    }
  }

  if (Object.keys(update).length) await Report.updateOne({ _id: report._id }, { $set: update });
  await createMatchSuggestions(reportId);
}

async function runJob(job: { _id: unknown; report: unknown; revision: number }) {
  try {
    await enrichReport(String(job.report));
    await MatchingJob.updateOne(
      { _id: job._id, status: "processing", revision: job.revision },
      { $set: { status: "completed", lockedAt: null, lastError: null }, $inc: { attempts: 1 } },
    );
  } catch (error) {
    const attempts = await MatchingJob.findById(job._id).select("attempts revision").lean();
    if (!attempts || attempts.revision !== job.revision) return;
    const nextAttempt = attempts.attempts + 1;
    const failed = nextAttempt >= maxAttempts;
    const lastError = error instanceof Error ? error.message.slice(0, 500) : "Unknown matching error";
    await MatchingJob.updateOne(
      { _id: job._id, status: "processing", revision: job.revision },
      {
        $set: {
          status: failed ? "failed" : "pending",
          lockedAt: null,
          lastError,
          nextRunAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** nextAttempt)),
        },
        $inc: { attempts: 1 },
      },
    );
  }
}

export function startMatchingWorker() {
  let stopped = false;
  const loop = (async () => {
    try {
      await MatchingJob.updateMany(
        { status: "processing", lockedAt: { $lt: new Date(Date.now() - staleLockMs) } },
        { $set: { status: "pending", lockedAt: null, nextRunAt: new Date() } },
      );
    } catch (error) {
      console.error("Matching worker could not recover stale jobs during startup.", error);
    }
    while (!stopped) {
      try {
        const now = new Date();
        const job = await MatchingJob.findOneAndUpdate(
          { status: "pending", nextRunAt: { $lte: now } },
          { $set: { status: "processing", lockedAt: now } },
          { new: true, sort: { nextRunAt: 1, createdAt: 1 } },
        ).select("report revision").lean();
        if (!job) {
          await delay(1500);
          continue;
        }
        await runJob(job);
      } catch (error) {
        console.error("Matching worker encountered a temporary error", error);
        await delay(3000);
      }
    }
  })();
  return async () => {
    stopped = true;
    await loop;
  };
}
