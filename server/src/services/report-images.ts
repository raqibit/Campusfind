import { createDownloadUrl } from "./object-storage.js";

type ReportWithImages = { imageUrls?: string[]; imageKeys?: string[] };

export async function attachReportImageUrls<T extends ReportWithImages>(report: T): Promise<Omit<T, "imageKeys"> & { imageUrls: string[] }> {
  const imageKeys = report.imageKeys ?? [];
  const signedUrls = await Promise.all(imageKeys.map((key) => createDownloadUrl(key)));
  const { imageKeys: _storedKeys, ...safeReport } = report;
  return { ...safeReport, imageUrls: [...(report.imageUrls ?? []), ...signedUrls] };
}
