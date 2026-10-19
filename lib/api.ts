import type { ItemCategory, ReportType } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
const SESSION_KEY = "campusfind_session";

export interface ApiSession {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    matricNumber: string;
    role: "student" | "finder" | "admin";
    verified: boolean;
    university: { id: string; name: string; shortName: string };
  };
}

export interface ApiReport {
  _id: string;
  type: ReportType;
  title: string;
  category: ItemCategory;
  publicDescription: string;
  location: { label: string };
  happenedAt: string;
  status: "open" | "matched" | "claimed" | "returned";
  imageUrls?: string[];
  reporter?: { fullName?: string };
}

export interface ApiUniversity {
  _id: string;
  name: string;
  shortName: string;
  campuses: string[];
}

export const apiConfigured = Boolean(API_BASE_URL);

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  if (!API_BASE_URL) throw new Error("The CampusFind API URL is not configured.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "The CampusFind service could not complete the request.");
  }
  return payload as T;
}

export async function login(credentials: { email: string; password: string }) {
  const response = await request<{ data: ApiSession }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return response.data;
}

export async function register(input: {
  fullName: string;
  email: string;
  matricNumber: string;
  password: string;
  universityId: string;
}) {
  const response = await request<{ data: ApiSession }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function listUniversities() {
  const response = await request<{ data: ApiUniversity[] }>("/auth/universities");
  return response.data;
}

export function saveSession(session: ApiSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readSession(): ApiSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ApiSession) : null;
  } catch {
    return null;
  }
}

export function removeSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function listReports(universityId: string) {
  const response = await request<{ data: ApiReport[] }>(`/reports?universityId=${encodeURIComponent(universityId)}`);
  return response.data;
}

export async function publishReport(
  token: string,
  input: {
    type: ReportType;
    title: string;
    category: ItemCategory;
    publicDescription: string;
    location: { label: string };
    happenedAt: string;
    imageUrls: string[];
    imageKeys?: string[];
  },
) {
  const response = await request<{ data: ApiReport; meta: { matchesCreated: number } }>(
    "/reports",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
  return response;
}



export interface ApiMatchReport {
  _id: string;
  type: ReportType;
  title: string;
  category: ItemCategory;
  publicDescription: string;
  location: { label: string };
  happenedAt: string;
  imageUrls?: string[];
  reporter?: { _id?: string; fullName?: string };
  status: ApiReport["status"];
}

export interface ApiMatch {
  _id: string;
  score: number;
  factors: { image: number; text: number; attributes: number; location: number; date: number };
  status: "suggested" | "reviewing" | "approved" | "rejected";
  lostReport: ApiMatchReport;
  foundReport: ApiMatchReport;
}

export async function listMyMatches(token: string) {
  const response = await request<{ data: ApiMatch[] }>("/matches/my", {}, token);
  return response.data;
}

export async function createClaim(token: string, input: {
  matchId: string;
  privateDetail: string;
  proofUrls?: string[];
  proofKeys?: string[];
}) {
  const response = await request<{ data: { id: string; status: "pending" | "approved" | "rejected" | "more_evidence"; createdAt: string } }>(
    "/claims",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
  return response.data;
}

export async function uploadFile(token: string, file: File, purpose: "report-image" | "claim-evidence") {
  const allowed = purpose === "report-image" ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) throw new Error("Choose a JPG, PNG or WEBP image" + (purpose === "claim-evidence" ? ", or a PDF document." : "."));
  const maxBytes = purpose === "report-image" || file.type.startsWith("image/") ? 8 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`This file must be smaller than ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  const signed = await request<{ data: { key: string; uploadUrl: string; contentType: string; maxBytes: number } }>("/uploads/presign", { method: "POST", body: JSON.stringify({ purpose, contentType: file.type }) }, token);
  if (file.size > signed.data.maxBytes) throw new Error("This file exceeds the storage limit.");
  const uploaded = await fetch(signed.data.uploadUrl, { method: "PUT", headers: { "Content-Type": signed.data.contentType }, body: file });
  if (!uploaded.ok) throw new Error("The file could not be uploaded. Check storage CORS settings and try again.");
  return signed.data.key;
}

export interface ApiAdminClaim {
  _id: string;
  status: "pending" | "approved" | "rejected" | "more_evidence";
  privateDetail: string;
  reviewNote?: string;
  evidenceCount: number;
  createdAt: string;
  claimant?: { fullName?: string; email?: string; matricNumber?: string };
  match?: { lostReport?: { title?: string; category?: ItemCategory }; foundReport?: { title?: string; category?: ItemCategory } };
}

export async function listAdminClaims(token: string) {
  const response = await request<{ data: ApiAdminClaim[] }>("/admin/claims", {}, token);
  return response.data;
}

export async function getClaimEvidenceUrl(token: string, claimId: string, index: number) {
  const response = await request<{ data: { url: string; expiresInSeconds: number } }>(`/admin/claims/${encodeURIComponent(claimId)}/evidence/${index}`, {}, token);
  return response.data;
}

export interface ApiNotification {
  _id: string;
  kind: "match" | "claim" | "handover" | "system";
  title: string;
  message: string;
  actionPath?: string;
  readAt?: string | null;
  createdAt: string;
}

export async function listNotifications(token: string) {
  const response = await request<{ data: ApiNotification[] }>("/notifications", {}, token);
  return response.data;
}

export async function markNotificationRead(token: string, notificationId: string) {
  await request<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" }, token);
}

export async function markAllNotificationsRead(token: string) {
  await request<void>("/notifications/read-all", { method: "PATCH" }, token);
}
