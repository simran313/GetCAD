/**
 * How designer and pod lead screens describe work (docs/design D2–D6, P1–P5).
 * Framework-free so the words and the arithmetic are unit-tested, and so the
 * job list, the job page and the team board can never disagree.
 */

import type { StatusKind } from "../orders/status";

/** D3's tabs: what the designer must do, what is with QC, what is done. */
export type JobTab = "open" | "qc" | "done";

const OPEN = new Set(["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"]);
const WITH_QC = new Set(["DESIGNER_SUBMITTED", "QC_REVIEW"]);

export function jobTab(status: string): JobTab {
  if (OPEN.has(status)) return "open";
  if (WITH_QC.has(status)) return "qc";
  return "done";
}

/** Open work for the capacity count and the team board. */
export function isOpenJob(status: string): boolean {
  return OPEN.has(status) || WITH_QC.has(status);
}

/** The job's state in the designer's words, and how loudly to show it. */
export function jobState(status: string): { word: string; kind: StatusKind } {
  switch (status) {
    case "ASSIGNED":
      return { word: "Not started", kind: "muted" };
    case "IN_PROGRESS":
      return { word: "In progress", kind: "active" };
    case "REVISION_REQUESTED":
      return { word: "Revision", kind: "needs" };
    case "DESIGNER_SUBMITTED":
    case "QC_REVIEW":
      return { word: "In QC", kind: "active" };
    case "CLIENT_PREVIEW":
      return { word: "With client", kind: "done" };
    case "DISPUTED":
      return { word: "Rework", kind: "needs" };
    case "CANCELLED":
    case "REFUNDED":
      return { word: "Cancelled", kind: "muted" };
    default:
      return { word: "Done", kind: "done" };
  }
}

/** "15 MIN", "1 H", "90 MIN", "3 H" — as the category is printed in the mockups. */
export function minutesWord(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  return minutes % 60 === 0 ? `${minutes / 60} H` : `${minutes} MIN`;
}

/**
 * When the designer's own timer runs out: category minutes from Start work
 * (DECISIONS §6). Null until they press it.
 */
export function jobClockDue(startedAt: string | null | undefined, minutes: number | null | undefined): string | null {
  if (!startedAt || !minutes) return null;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + minutes * 60_000).toISOString();
}

/**
 * QC / pod lead pay for an order (DECISIONS §5):
 * max(₹500, round to nearest ₹50 of order USD × 1000 / 60), in paise.
 * The database locks the real amount at quote; this is for the rate table.
 */
export function qcPayoutPaise(orderUsdCents: number): number {
  const rupees = (orderUsdCents / 100) * (1000 / 60);
  const rounded = Math.round(rupees / 50) * 50;
  return Math.max(500, rounded) * 100;
}

/** "₹1,500" from paise. */
export function rupeesWord(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** Load on the team board: open category minutes against the shift. */
export function loadWord(openMinutes: number, shiftMinutes: number): string {
  return openMinutes === 0 ? `FREE · 0 / ${shiftMinutes} MIN` : `${openMinutes} / ${shiftMinutes} MIN`;
}
