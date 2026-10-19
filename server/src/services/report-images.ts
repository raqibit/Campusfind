import { createDownloadUrl } from "./object-storage.js";

type ReportWithImages = { imageUrls?: string[]; imageKeys?: string[] };

export async function attachReportImageUrls<T extends ReportWithImages>(report: T): Promise<Omit<T, "imageKeys"> & { imageUrls: string[] }> {
  const signedUrls = await Promise.all((report.imageKeys ?? []).map((key) => createDownloadUrl(key)));
  const { imageKeys: _imageKeys, ...safeReport } = report;
  return { ...safeReport, imageUrls: [...(report.imageUrls ?? []), ...signedUrls] };
}
