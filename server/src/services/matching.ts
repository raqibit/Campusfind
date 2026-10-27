import { Types } from "mongoose";
import { Match } from "../models/match.js";
import { Notification } from "../models/notification.js";
import { Report } from "../models/report.js";

export interface MatchableReport {
  _id?: unknown;
  university?: unknown;
  reporter?: unknown;
  type: "lost" | "found";
  title: string;
  category: string;
  publicDescription: string;
  attributes?: { colour?: string | null; brand?: string | null; model?: string | null } | null;
  location: { label: string; latitude?: number | null; longitude?: number | null };
  happenedAt: Date | string;
  imageEmbedding?: number[] | null;
  imageDescriptorEmbedding?: number[] | null;
  imageDescriptorEmbeddingModel?: string | null;
  textEmbedding?: number[] | null;
  textEmbeddingModel?: string | null;
}

const stopWords = new Set(["a", "an", "and", "at", "found", "in", "item", "lost", "near", "of", "the", "with"]);

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

export function tokenSimilarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return Math.round((intersection / union) * 100);
}

export function cosineSimilarity(left?: number[] | null, right?: number[] | null) {
  if (!left?.length || !right?.length || left.length !== right.length) return 50;
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    normLeft += a * a;
    normRight += b * b;
  }
  if (!normLeft || !normRight) return 0;
  const cosine = dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
  return Math.round(Math.max(0, Math.min(1, cosine)) * 100);
}

function attributeSimilarity(left: MatchableReport, right: MatchableReport) {
  const comparisons: boolean[] = [left.category.toLowerCase() === right.category.toLowerCase()];
  for (const key of ["colour", "brand", "model"] as const) {
    const a = left.attributes?.[key]?.trim().toLowerCase();
    const b = right.attributes?.[key]?.trim().toLowerCase();
    if (a && b) comparisons.push(a === b);
  }
  return Math.round((comparisons.filter(Boolean).length / comparisons.length) * 100);
}

function haversineKm(left: MatchableReport["location"], right: MatchableReport["location"]) {
  if (
    left.latitude == null ||
    left.longitude == null ||
    right.latitude == null ||
    right.longitude == null
  ) return null;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(left.latitude)) *
      Math.cos(toRadians(right.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationSimilarity(left: MatchableReport, right: MatchableReport) {
  const distance = haversineKm(left.location, right.location);
  if (distance != null) return Math.round(Math.max(0, 100 - distance * 25));
  return tokenSimilarity(left.location.label, right.location.label);
}

function dateSimilarity(left: MatchableReport, right: MatchableReport) {
  const day = 86_400_000;
  const distance = Math.abs(new Date(left.happenedAt).getTime() - new Date(right.happenedAt).getTime()) / day;
  return Math.round(Math.max(0, 100 - distance * 10));
}

export function scoreReports(left: MatchableReport, right: MatchableReport) {
  const hasProviderVectors = Boolean(left.imageEmbedding?.length && right.imageEmbedding?.length);
  const hasCompatibleDescriptors = Boolean(
    left.imageDescriptorEmbedding?.length &&
    right.imageDescriptorEmbedding?.length &&
    left.imageDescriptorEmbeddingModel &&
    left.imageDescriptorEmbeddingModel === right.imageDescriptorEmbeddingModel,
  );
  const image = hasProviderVectors
    ? cosineSimilarity(left.imageEmbedding, right.imageEmbedding)
    : hasCompatibleDescriptors
      ? cosineSimilarity(left.imageDescriptorEmbedding, right.imageDescriptorEmbedding)
      : 50;
  const sameEmbeddingModel = left.textEmbeddingModel && left.textEmbeddingModel === right.textEmbeddingModel;
  const text = sameEmbeddingModel && left.textEmbedding?.length && right.textEmbedding?.length
    ? cosineSimilarity(left.textEmbedding, right.textEmbedding)
    : tokenSimilarity(
      `${left.title} ${left.publicDescription}`,
      `${right.title} ${right.publicDescription}`,
    );
  const attributes = attributeSimilarity(left, right);
  const location = locationSimilarity(left, right);
  const date = dateSimilarity(left, right);
  const score = Math.round(image * 0.35 + text * 0.25 + attributes * 0.2 + location * 0.1 + date * 0.1);

  return { score, factors: { image, text, attributes, location, date } };
}

export async function createMatchSuggestions(reportId: string, threshold = 60, notificationThreshold = 75) {
  const report = await Report.findById(reportId).select("+imageEmbedding +imageDescriptorEmbedding +imageDescriptorEmbeddingModel +textEmbedding").lean();
  if (!report) return [];

  const earliest = new Date(new Date(report.happenedAt).getTime() - 90 * 86_400_000);
  const latest = new Date(new Date(report.happenedAt).getTime() + 90 * 86_400_000);
  const candidates = await Report.find({
    _id: { $ne: report._id },
    university: report.university,
    type: report.type === "lost" ? "found" : "lost",
    status: { $in: ["open", "matched"] },
    happenedAt: { $gte: earliest, $lte: latest },
  })
    .select("+imageEmbedding +imageDescriptorEmbedding +imageDescriptorEmbeddingModel +textEmbedding")
    .limit(200)
    .lean();

  const created = [];
  for (const candidate of candidates) {
    const result = scoreReports(report as MatchableReport, candidate as MatchableReport);
    if (result.score < threshold) continue;
    const lost = report.type === "lost" ? report : candidate;
    const found = report.type === "found" ? report : candidate;
    const match = await Match.findOneAndUpdate(
      { lostReport: lost._id, foundReport: found._id },
      {
        $set: { score: result.score, factors: result.factors },
        $setOnInsert: {
          university: report.university,
          lostReport: lost._id,
          foundReport: found._id,
          status: "suggested",
        },
      },
      { upsert: true, new: true },
    );
    created.push(match);
    await Report.updateMany({ _id: { $in: [lost._id, found._id] } }, { status: "matched" });
    if (!match.notifiedAt && result.score >= notificationThreshold) {
      const recipients = new Map<string, { title: string; message: string }>();
      recipients.set(lost.reporter.toString(), {
        title: "Your lost item may have been found",
        message: `${found.title} is a ${result.score}% possible match for your report. Review the clues before claiming.`,
      });
      recipients.set(found.reporter.toString(), {
        title: "Your found report may match a lost item",
        message: `${lost.title} is a ${result.score}% possible match for your found report. Keep private details inside CampusFind.`,
      });
      await Promise.all([...recipients].map(([user, notice]) => Notification.updateOne(
        { user, dedupeKey: `match:${match.id}:${user}` },
        { $setOnInsert: { user, ...notice, kind: "match", actionPath: `/matches/${match.id}`, dedupeKey: `match:${match.id}:${user}` } },
        { upsert: true },
      )));
      match.notifiedAt = new Date();
      await match.save();
    }
  }
  return created;
}

export function toObjectId(value: string) {
  return new Types.ObjectId(value);
}
