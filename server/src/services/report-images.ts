import { createDownloadUrl, objectStorageConfigured } from "./object-storage.js";

type ReportWithImages = { imageUrls?: string[]; imageKeys?: string[] };

export async function attachReportImageUrls<T extends ReportWithImages>(report: T): Promise<Omit<T, "imageKeys"> & { imageUrls: string[] }> {
  const { imageKeys = [], ...safeReport } = report;
  const signedUrls = objectStorageConfigured() ? await Promise.all(imageKeys.map((key) => createDownloadUrl(key, 3600))) : [];
  return { ...safeReport, imageUrls: [...(report.imageUrls ?? []), ...signedUrls] };
}
