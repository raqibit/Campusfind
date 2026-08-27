export type Screen =
  | "home"
  | "reports"
  | "detail"
  | "create"
  | "notifications"
  | "match"
  | "claim"
  | "admin"
  | "profile";

export type ReportType = "lost" | "found";
export type ReportStatus = "open" | "matched" | "claimed" | "returned";
export type ItemCategory =
  | "Identity card"
  | "Wallet"
  | "Electronics"
  | "Bag"
  | "Keys"
  | "Books"
  | "Other";

export interface ItemReport {
  id: string;
  type: ReportType;
  title: string;
  category: ItemCategory;
  description: string;
  location: string;
  date: string;
  reporter: string;
  status: ReportStatus;
  image?: string;
  accent: string;
  initials: string;
}

export interface MatchCandidate {
  id: string;
  lostReportId: string;
  foundReportId: string;
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

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  kind: "match" | "claim" | "system";
  read: boolean;
}

export interface ClaimRecord {
  id: string;
  claimant: string;
  item: string;
  submitted: string;
  evidence: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
}
