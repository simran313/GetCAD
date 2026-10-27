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
  /** One short line under the headline (a price, a promise, a time); none when the headline says it all. */
  detail: string | null;
  /** The one button, or null when nothing waits on the client. */
  action: string | null;
  /** Path for the action: the order's pay, review or brief page, chat, or the files page. */
  href: string;
}

/** What the order page knows that sharpens the next step; everything optional. */
export interface ClientStepContext {
  /** Already formatted for the viewer ("$85.00"). */
  price?: string | null;
  tier?: string | null;
  complexHours?: number | null;
  service?: string | null;
  /** Revision rounds used so far: a preview after one is a new version. */
  roundsUsed?: number;
  /** The first-look deadline while the clock runs, formatted in the viewer's zone. */
  firstLookBy?: string | null;
}

/** Hours to the first look the client is promised (DECISIONS §6): 6, or the complex deadline. */
export function firstLookHours(tier: string | null | undefined, complexHours: number | null | undefined): number | null {
  return tier === "complex" ? (complexHours ?? null) : 6;
}

/** What a paid order delivers, in one line (pay page and the quote card). */
export function whatYouGet(service: string | null | undefined): string {
  return `${service === "render" ? "Rendered views to approve." : "Renders to approve, then STL, 3DM and a summary sheet."} Two rounds of changes are included within 14 days of your first look.`;
}

/**
 * The one thing to do or know next. Deterministic: the status decides the
 * step; the context only fills in the price, the promise and the time.
 */
export function clientNextStep(orderId: string, status: string, ctx: ClientStepContext = {}): ClientStep {
  const o = `/orders/${orderId}`;
  const hours = firstLookHours(ctx.tier, ctx.complexHours);
  const by = ctx.firstLookBy ? `First look by ${ctx.firstLookBy}` : null;
  switch (status) {
    case "DRAFT":
      return { headline: "Finish your brief", detail: null, action: "Continue", href: `${o}/brief` };
    case "SUBMITTED":
      return { headline: "We're pricing your brief", detail: "You'll get a message when it's ready.", action: null, href: o };
    case "QUOTED":
      return {
        headline: "Your price is ready",
        detail: [ctx.price, hours ? `first look within ${hours} h` : null].filter(Boolean).join(" · ") || null,
        action: "Pay & start",
        href: `${o}/pay`,
      };
    case "PAYMENT_HELD":
      return { headline: "Paid", detail: "The clock starts when we confirm your brief.", action: null, href: o };
    case "CLIENT_PREVIEW":
      return {
        headline: (ctx.roundsUsed ?? 0) > 0 ? "A new version is ready" : ctx.service === "render" ? "Your renders are ready" : "Your design is ready",
        detail: null,
        action: "Review",
        href: `${o}/review`,
      };
    case "REVISION_REQUESTED":
      return { headline: "Your changes are being made", detail: by, action: null, href: o };
    case "APPROVED":
    case "DELIVERED":
    case "CLOSED":
    case "PAYOUT_RELEASED":
      return { headline: "Files ready", detail: null, action: "Download", href: "/files" };
    case "DISPUTED":
      return { headline: "We're looking into a problem", detail: null, action: "Message", href: `/messages/${orderId}` };
    case "CANCELLED":
      return { headline: "Cancelled", detail: null, action: null, href: o };
    case "REFUNDED":
      return { headline: "Refunded", detail: null, action: null, href: o };
    case "QC_REVIEW":
    case "DESIGNER_SUBMITTED":
      return { headline: "In quality check", detail: by, action: null, href: o };
    default:
      return { headline: "In design", detail: by, action: null, href: o };
  }
}

/** The journey on the order page: five labelled stages. */
export const CLIENT_STEPS = ["Brief", "Quote", "Design", "Review", "Delivered"] as const;

/**
 * How many of CLIENT_STEPS are done (0–5); the next one is the current
 * stage. Null for an order that ended without delivery (no journey to show).
 */
export function clientStepsDone(status: string): number | null {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
    case "QUOTED":
      return 1;
    case "PAYMENT_HELD":
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "REVISION_REQUESTED":
    case "DESIGNER_SUBMITTED":
    case "QC_REVIEW":
    case "DISPUTED":
      return 2;
    case "CLIENT_PREVIEW":
      return 3;
    case "APPROVED":
      return 4;
    case "DELIVERED":
    case "CLOSED":
    case "PAYOUT_RELEASED":
      return 5;
    default:
      return null;
  }
}
