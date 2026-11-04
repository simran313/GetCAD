import type { PillTone } from "@/components/ui/status-pill";

/** One row of admin_designers() (0061). */
export interface DesignerRow {
  user_id: string;
  legal_name: string;
  email: string;
  phone: string | null;
  status: string;
  agreement_signed: boolean;
  designer_ref: string | null;
  pod_id: string | null;
  pod_name: string | null;
  payout_status: string | null;
  account_last4: string | null;
  documents: number;
  created_at: string;
}

export function statusWord(r: Pick<DesignerRow, "status" | "agreement_signed">): { word: string; tone: PillTone } {
  if (r.status === "SUSPENDED") return { word: "Suspended", tone: "danger" };
  if (!r.agreement_signed) return { word: "Waiting to sign in", tone: "attention" };
  if (r.status === "ACTIVE") return { word: "Active", tone: "success" };
  return { word: "Pending", tone: "neutral" };
}

export function bankWord(r: Pick<DesignerRow, "payout_status" | "account_last4">): { word: string; tone: PillTone } {
  if (!r.payout_status) return { word: "No bank details", tone: "attention" };
  const tail = r.account_last4 ? ` ··${r.account_last4}` : "";
  if (r.payout_status === "VERIFIED") return { word: `Verified${tail}`, tone: "success" };
  if (r.payout_status === "REJECTED") return { word: `Rejected${tail}`, tone: "danger" };
  return { word: `To check${tail}`, tone: "warning" };
}

export const DOCUMENT_KINDS: [string, string][] = [
  ["PAN_CARD", "PAN card"],
  ["AADHAAR", "Aadhaar (masked copy)"],
  ["BANK_PROOF", "Bank proof (cheque or passbook)"],
  ["PHOTO", "Photo"],
  ["OTHER", "Other"],
];
