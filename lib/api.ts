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
    linkedProviders?: string[];
    university: { id: string; name: string; shortName: string };
  };
}

export interface ApiReport {
  _id: string;
  type: ReportType;
  title: string;
  category: ItemCategory;
  publicDescription: string;
  location: { label: string; latitude?: number; longitude?: number };
  happenedAt: string;
  status: "open" | "matched" | "claimed" | "returned" | "archived";
  imageUrls?: string[];
  reporter?: { _id?: string; id?: string; fullName?: string } | string | null;
}

export interface ApiMatch {
  _id: string;
  lostReport: ApiReport;
  foundReport: ApiReport;
  score: number;
  factors: {
    image: number;
    text: number;
    attributes: number;
    location: number;
    date: number;
  };
  status: "suggested" | "reviewing" | "approved" | "rejected";
}

export type ClaimStatus = "pending" | "approved" | "rejected" | "more_evidence";

export interface ApiClaim {
  id: string;
  status: ClaimStatus;
  createdAt: string;
}

export interface ApiClaimReviewResult {
  id: string;
  status: ClaimStatus;
  reviewedAt: string;
}

export interface ApiClaimRecord {
  _id: string;
  status: ClaimStatus;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNote?: string;
  match: { _id: string } | string;
}

type ApiAdminReport = Pick<ApiReport, "_id" | "title" | "category" | "publicDescription" | "location" | "happenedAt"> & {
  privateDetails?: string;
  reporter?: ApiReport["reporter"];
};

export interface ApiAdminClaim {
  _id: string;
  privateDetail: string;
  proofUrls?: string[];
  status: ClaimStatus;
  createdAt: string;
  evidenceHistory?: { privateDetail: string; submittedAt: string }[];
  proofCount?: number;
  claimant: {
    fullName: string;
    email: string;
    matricNumber: string;
    verified: boolean;
  };
  match: {
    _id: string;
    score: number;
    lostReport: ApiAdminReport;
    foundReport: ApiAdminReport;
  };
}

type ApiHandoverReport = Pick<ApiReport, "_id" | "title" | "category" | "location"> & {
  reporter?: ApiReport["reporter"];
};

export interface ApiHandover {
  _id: string;
  handoverPoint: string;
  scheduledFor: string;
  finderConfirmedAt: string | null;
  ownerConfirmedAt: string | null;
  completedAt: string | null;
  auditCode: string;
  claim: {
    _id: string;
    claimant: { _id?: string; id?: string; fullName?: string } | string;
    match: {
      lostReport: ApiHandoverReport;
      foundReport: ApiHandoverReport;
    };
  };
}

export interface ApiHandoverConfirmation {
  id: string;
  finderConfirmedAt: string | null;
  ownerConfirmedAt: string | null;
  completedAt: string | null;
}

export interface ApiChatMessage {
  _id: string;
  match: string;
  sender: { _id: string; fullName: string } | string;
  body: string;
  createdAt: string;
}

export interface ApiUploadedFile {
  key: string;
  contentType: string;
  size: number;
  publicUrl?: string;
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
  const send = (includeBearer: boolean) => fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CampusFind-Client": "1",
      ...options.headers,
      ...(includeBearer && token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  let response = await send(true);
  const noRefreshPaths = ["/auth/login", "/auth/register", "/auth/verify-email", "/auth/resend-verification", "/auth/password-reset/request", "/auth/password-reset/confirm", "/auth/refresh", "/auth/logout"];
  if (response.status === 401 && !noRefreshPaths.includes(path)) {
    const refresh = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CampusFind-Client": "1" },
    }).catch(() => null);
    if (refresh?.ok) response = await send(false);
  }
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "The CampusFind service could not complete the request.");
  }
  return payload as T;
}

export async function login(credentials: { email: string; password: string }) {
  const response = await request<{ data: { user: ApiSession["user"] } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return { token: "", user: response.data.user };
}

export interface ApiRegistrationResult {
  verificationRequired: true;
  email: string;
}

export async function register(input: {
  fullName: string;
  email: string;
  matricNumber: string;
  password: string;
  universityId: string;
}) {
  const response = await request<{ data: ApiRegistrationResult }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function verifyEmail(input: { email: string; code: string }) {
  const response = await request<{ data: { user: ApiSession["user"] } }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { token: "", user: response.data.user };
}

export async function resendEmailVerification(email: string) {
  await request<{ data: { accepted: true } }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function requestPasswordReset(email: string) {
  await request<{ data: { accepted: true } }>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(input: { email: string; code: string; password: string }) {
  await request<{ data: { updated: true } }>("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function startOAuth(provider: "google" | "apple") {
  const response = await request<{ data: { url: string } }>(`/auth/oauth/${provider}/start`, { method: "POST", body: "{}" });
  return response.data.url;
}

export async function startOAuthLink(token: string, provider: "google" | "apple") {
  const response = await request<{ data: { url: string } }>(`/auth/oauth/${provider}/link`, { method: "POST", body: "{}" }, token);
  return response.data.url;
}

export async function getCurrentSession() {
  const response = await request<{ data: { user: ApiSession["user"] } }>("/auth/me", {}, "");
  return { token: "", user: response.data.user };
}

export async function logout(token?: string) {
  await request<void>("/auth/logout", { method: "POST", body: "{}" }, token);
}

export async function listUniversities() {
  const response = await request<{ data: ApiUniversity[] }>("/auth/universities");
  return response.data;
}

export function saveSession(session: ApiSession) {
  const stored = session.token === "campusfind-demo-session" ? session : { ...session, token: "" };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
}

export function readSession(): ApiSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ApiSession;
    if (session.token && session.token !== "campusfind-demo-session") {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, token: "" }));
    }
    return session;
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
    privateDetails?: string;
    consentImageAnalysis?: boolean;
    location: { label: string; latitude?: number; longitude?: number };
    happenedAt: string;
    imageKeys: string[];
  },
) {
  const response = await request<{ data: ApiReport; meta: { matchesCreated: number } }>(
    "/reports",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
  return response;
}

export async function uploadFile(token: string, file: File, purpose: "report-media" | "claim-evidence") {
  if (!API_BASE_URL) throw new Error("The CampusFind API URL is not configured.");
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    headers: { "X-CampusFind-Client": "1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "The file could not be uploaded.");
  return payload.data as ApiUploadedFile;
}

export async function listMyMatches(token: string) {
  const response = await request<{ data: ApiMatch[] }>("/matches/my", {}, token);
  return response.data;
}

export async function getMatch(token: string, matchId: string) {
  const response = await request<{ data: ApiMatch }>(`/matches/${encodeURIComponent(matchId)}`, {}, token);
  return response.data;
}

export async function submitClaim(token: string, input: { matchId: string; privateDetail: string; proofKeys?: string[] }) {
  const response = await request<{ data: ApiClaim }>("/claims", {
    method: "POST",
    body: JSON.stringify(input),
  }, token);
  return response.data;
}

export async function getClaimEvidenceUrl(token: string, claimId: string, index: number) {
  const response = await request<{ data: { url: string; expiresInSeconds: number } }>(
    `/admin/claims/${encodeURIComponent(claimId)}/evidence/${index}`,
    {},
    token,
  );
  return response.data;
}

export async function listMyClaims(token: string) {
  const response = await request<{ data: ApiClaimRecord[] }>("/claims/my", {}, token);
  return response.data;
}

export async function listAdminClaims(token: string) {
  const response = await request<{ data: ApiAdminClaim[] }>("/admin/claims", {}, token);
  return response.data;
}

export async function reviewClaim(
  token: string,
  claimId: string,
  input: {
    status: Exclude<ClaimStatus, "pending">;
    reviewNote: string;
    handoverPoint?: string;
    scheduledFor?: string;
  },
) {
  const response = await request<{ data: ApiClaimReviewResult }>(`/admin/claims/${encodeURIComponent(claimId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, token);
  return response.data;
}

export async function listMyHandovers(token: string) {
  const response = await request<{ data: ApiHandover[] }>("/handovers/my", {}, token);
  return response.data;
}

export async function confirmHandover(token: string, handoverId: string, party: "finder" | "owner") {
  const response = await request<{ data: ApiHandoverConfirmation }>(`/handovers/${encodeURIComponent(handoverId)}/confirm`, {
    method: "PATCH",
    body: JSON.stringify({ party }),
  }, token);
  return response.data;
}

export async function listChatMessages(token: string, matchId: string, after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}&limit=100` : "?limit=100";
  const response = await request<{ data: ApiChatMessage[] }>(`/chats/${encodeURIComponent(matchId)}/messages${query}`, {}, token);
  return response.data;
}

export async function sendChatMessage(token: string, matchId: string, input: { body: string; clientMessageId: string }) {
  const response = await request<{ data: ApiChatMessage }>(`/chats/${encodeURIComponent(matchId)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);
  return response.data;
}


export interface ApiNotification {
  _id: string;
  kind: "match" | "claim" | "handover" | "chat" | "system";
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
