/**
 * What a client sees about each order on the redesigned screens (Phase 5b,
 * docs/design C1, C3, C4): which tab it falls under, the one next step, and
 * where it is on the seven-step journey. Framework-free and unit-tested so
 * Home, Orders and the order page always agree.
 */

export type ClientTab = "needs" | "progress" | "reopened" | "completed" | "cancelled";

/** Quoted (pay) and ready-to-preview (review) wait on the client. */
export function clientTab(status: string): ClientTab {
  switch (status) {
    case "QUOTED":
    case "CLIENT_PREVIEW":
    case "DRAFT":
      return "needs";
    case "REVISION_REQUESTED":
    case "DISPUTED":
      return "reopened";
    case "APPROVED":
    case "DELIVERED":
    case "CLOSED":
    case "PAYOUT_RELEASED":
      return "completed";
    case "CANCELLED":
    case "REFUNDED":
      return "cancelled";
    default:
      return "progress";
  }
}

export interface ClientStep {
  headline: string;
  action: string;
  /** Path relative to the order: "" (the order), "/pay", "/review", "/brief", or the files page. */
  href: string;
}

/** The one thing to do or know next, in the mockups' words. */
export function clientNextStep(orderId: string, status: string): ClientStep {
  const o = `/orders/${orderId}`;
  switch (status) {
    case "DRAFT":
      return { headline: "Finish your brief", action: "Continue", href: `${o}/brief` };
    case "SUBMITTED":
      return { headline: "We're pricing your brief", action: "Open", href: o };
    case "QUOTED":
      return { headline: "Pay to start", action: "Pay", href: `${o}/pay` };
    case "CLIENT_PREVIEW":
      return { headline: "Your renders are ready", action: "Review renders", href: `${o}/review` };
    case "REVISION_REQUESTED":
      return { headline: "Your changes are being made", action: "Open", href: o };
    case "APPROVED":
    case "DELIVERED":
    case "CLOSED":
    case "PAYOUT_RELEASED":
      return { headline: "Files ready", action: "Download", href: "/files" };
    case "DISPUTED":
      return { headline: "We're looking into a problem", action: "Open", href: o };
    case "CANCELLED":
    case "REFUNDED":
      return { headline: "This order ended", action: "Open", href: o };
    default:
      return { headline: "In design", action: "Open", href: o };
  }
}

/** The journey on the order page (C4). */
export const CLIENT_STEPS = ["Brief", "Price", "Paid", "Design", "QC", "Review", "Files"] as const;

/** How many of CLIENT_STEPS are done (0–7). */
export function clientStepsDone(status: string): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
      return 1;
    case "QUOTED":
      return 2;
    case "PAYMENT_HELD":
      return 3;
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "REVISION_REQUESTED":
      return 3;
    case "DESIGNER_SUBMITTED":
    case "QC_REVIEW":
      return 4;
    case "CLIENT_PREVIEW":
      return 5;
    case "APPROVED":
      return 6;
    case "DELIVERED":
    case "CLOSED":
    case "PAYOUT_RELEASED":
      return 7;
    default:
      return 0;
  }
}
