import type { EscrowKind, FileKind } from "@/core";

/**
 * One row of public.visible_orders() (0036). There is no client_id or
 * designer_id here on purpose: who you are to the order arrives as
 * `relation`, and a designer gets null in every money column.
 */
export interface OrderRow {
  id: string;
  relation: "CLIENT" | "DESIGNER" | "ADMIN" | "POD_LEAD" | "QC_REVIEWER" | "STAFF";
  /** Client reference (MJ1-RN-C-17) — or, for a designer, the job code (RN-C-17). */
  display_ref: string | null;
  product_type: string;
  status: string;
  currency: string | null;
  price_total: number | null;
  designer_payout: number | null;
  qc_payout: number | null;
  platform_commission: number | null;
}

export interface VersionRow {
  id: string;
  order_id: string;
  version_no: number;
  content_type: string;
  size_bytes: number;
  /** What this file is. Drives the download gate — see core/files/downloadGate. */
  kind: FileKind;
  /** Who uploaded it, as a party — decides "this is your own upload". */
  uploader_party: "CLIENT" | "DESIGNER" | "TEAM";
}

export interface LedgerRow {
  order_id: string;
  kind: EscrowKind;
  amount: number;
}

/** One row of public.order_messages() (0036): an alias and is_mine, never a sender id. */
export interface MessageRow {
  id: string;
  thread_id: string;
  thread_kind: "client_team" | "internal" | "legacy";
  sender_party: "CLIENT" | "DESIGNER" | "TEAM";
  sender_alias: string;
  is_mine: boolean;
  body: string;
  created_at: string;
}

export interface DisputeRow {
  id: string;
  order_id: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  resolution: "REWORK" | "REFUND" | null;
  resolution_notes: string | null;
}
