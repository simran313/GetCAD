/**
 * Where an order stands for the team, and what the next staff move is
 * (docs/design A1 Queue, A3 Order). Framework-free so the queue's grouping,
 * its "why" line and the order page's next step all say the same thing.
 */

export type StaffStage =
  | "dispute"
  | "quote"
  | "payment"
  | "assign"
  | "designer"
  | "qc"
  | "client"
  | "deliver"
  | "close"
  | "payout"
  | "done"
  | "cancelled";

/** Stages where the team has the next move; the queue lists only these. */
export const STAFF_STAGES: StaffStage[] = ["dispute", "quote", "assign", "deliver", "close", "payout"];

/** The counters along the top of the queue, in flow order. */
export const STAGE_LABELS: [StaffStage, string][] = [
  ["quote", "Awaiting quote"],
  ["payment", "Awaiting payment"],
  ["assign", "Ready to assign"],
  ["designer", "With designer"],
  ["qc", "In QC"],
  ["client", "With client"],
  ["deliver", "Ready to deliver"],
  ["close", "Delivered"],
  ["payout", "Ready for payout"],
  ["dispute", "Dispute"],
];

export interface StaffFacts {
  status: string;
  podId: string | null;
  confirmed: boolean;
  designerId?: string | null;
  category: string | null;
  source?: string | null;
  disputeReason?: string | null;
}

export interface StaffNext {
  stage: StaffStage;
  why: string;
  action: string;
}

const SOURCE_WORD: Record<string, string> = { whatsapp: "Via WhatsApp", email: "Via email", phone: "Via phone" };

export function staffStage(status: string): StaffStage {
  switch (status) {
    case "DISPUTED":
      return "dispute";
    case "SUBMITTED":
      return "quote";
    case "QUOTED":
      return "payment";
    case "PAYMENT_HELD":
      return "assign";
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "REVISION_REQUESTED":
      return "designer";
    case "DESIGNER_SUBMITTED":
    case "QC_REVIEW":
      return "qc";
    case "CLIENT_PREVIEW":
      return "client";
    case "APPROVED":
      return "deliver";
    case "DELIVERED":
      return "close";
    case "CLOSED":
      return "payout";
    case "CANCELLED":
    case "REFUNDED":
      return "cancelled";
    default:
      return "done";
  }
}

export function staffNext(f: StaffFacts): StaffNext {
  const stage = staffStage(f.status);
  const via = f.source && SOURCE_WORD[f.source] ? `${SOURCE_WORD[f.source]} · ` : "";
  switch (stage) {
    case "dispute":
      return { stage, why: f.disputeReason?.trim() || "The client raised a problem", action: "Resolve" };
    case "quote":
      return { stage, why: `${via}${f.category ? "check the brief and price it" : "set category and price"}`, action: "Price it" };
    case "payment":
      return { stage, why: "Waiting for the client to pay, or mark a transfer received", action: "Open" };
    case "assign":
      if (!f.podId) return { stage, why: "Paid · choose a pod", action: "Choose a pod" };
      if (!f.confirmed) return { stage, why: "Paid · confirm the order to start the clock", action: "Confirm" };
      return { stage, why: "Paid and confirmed · assign a designer", action: "Assign" };
    case "designer":
      return { stage, why: f.status === "REVISION_REQUESTED" ? "Back with the designer for changes" : "With the designer", action: "Open" };
    case "qc":
      return { stage, why: "With the pod lead for QC", action: "Open" };
    case "client":
      return { stage, why: "First look with the client", action: "Open" };
    case "deliver":
      return { stage, why: "Client approved · deliver the files", action: "Deliver" };
    case "close":
      return { stage, why: "Delivered · close the order", action: "Close" };
    case "payout":
      return { stage, why: "Closed · release the payouts", action: "Release" };
    case "cancelled":
      return { stage, why: f.status === "REFUNDED" ? "Refunded" : "Cancelled", action: "Open" };
    default:
      return { stage, why: "Done", action: "Open" };
  }
}

/** Queue order: disputes first, then the nearest client deadline, then oldest. */
export function queueRank(a: { stage: StaffStage; due: string | null; created: string }, b: typeof a): number {
  if ((a.stage === "dispute") !== (b.stage === "dispute")) return a.stage === "dispute" ? -1 : 1;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due !== b.due) return a.due ? -1 : 1;
  return a.created.localeCompare(b.created);
}
