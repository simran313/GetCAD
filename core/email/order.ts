/**
 * Client emails about their own orders (Phase 17, migration 0054). One email
 * per real event, written in the studio's voice: plain, warm, specific, and
 * never promising more than the guarantee. Each has one button that opens the
 * exact page the client needs (the order, its payment, its review, its
 * messages), never a generic dashboard. Links are portal pages behind sign-in:
 * nothing private travels in an email.
 *
 * Anonymity: a payload holds the client's own order and name only. The team
 * is "your team"; no designer or staff name can be rendered, because none is
 * ever handed in (DECISIONS §2, §11).
 */

import { BRAND, esc, renderLayout, SUPPORT_WHATSAPP_LINK, type EmailContent, type EmailLink } from "./layout";

export interface OrderEmailPayload {
  /** Added by the dispatcher from configuration; only https becomes a link. */
  site_url?: string;
  name?: string;
  order_id?: string;
  order_ref?: string | null;
  title?: string;
  /** Minor units (cents). */
  price?: number;
  currency?: string;
  version?: number;
  due_at?: string | null;
  deadline_hours?: number | null;
}

export interface OrderEmailPayloads {
  ORDER_RECEIVED: OrderEmailPayload;
  QUOTE_READY: OrderEmailPayload;
  QUOTE_REMINDER: OrderEmailPayload;
  PAYMENT_RECEIVED: OrderEmailPayload;
  ORDER_CONFIRMED: OrderEmailPayload;
  FIRST_LOOK_READY: OrderEmailPayload;
  REVISION_RECEIVED: OrderEmailPayload;
  REVISED_DESIGN_READY: OrderEmailPayload;
  PREVIEW_REMINDER: OrderEmailPayload;
  DESIGN_APPROVED: OrderEmailPayload;
  FILES_DELIVERED: OrderEmailPayload;
  PROBLEM_RECEIVED: OrderEmailPayload;
  ORDER_REFUNDED: OrderEmailPayload;
  ORDER_CANCELLED: OrderEmailPayload;
  ORDER_DELAYED: OrderEmailPayload;
  CREDIT_DECIDED: OrderEmailPayload & { decision?: string; amount?: number; credit_currency?: string };
  NEW_MESSAGE: OrderEmailPayload & { excerpt?: string };
  FEEDBACK_REQUEST: OrderEmailPayload;
  WELCOME: { name?: string; site_url?: string };
}

export type OrderEmailTemplate = keyof OrderEmailPayloads;
export const ORDER_EMAIL_TEMPLATES = [
  "WELCOME",
  "ORDER_RECEIVED",
  "QUOTE_READY",
  "QUOTE_REMINDER",
  "PAYMENT_RECEIVED",
  "ORDER_CONFIRMED",
  "FIRST_LOOK_READY",
  "REVISION_RECEIVED",
  "REVISED_DESIGN_READY",
  "PREVIEW_REMINDER",
  "DESIGN_APPROVED",
  "FILES_DELIVERED",
  "PROBLEM_RECEIVED",
  "ORDER_REFUNDED",
  "ORDER_CANCELLED",
  "ORDER_DELAYED",
  "CREDIT_DECIDED",
  "NEW_MESSAGE",
  "FEEDBACK_REQUEST",
] as const satisfies readonly OrderEmailTemplate[];

/* ---------------------------------------------------------------- helpers */

function first(raw: string | undefined): string {
  const w = (raw ?? "").replace(/\s+/g, " ").trim().split(" ")[0];
  return w ? w : "there";
}

/** The portal's origin when it is a real https address; otherwise no links. */
function base(p: { site_url?: string }): string | null {
  return p.site_url && /^https:\/\/[^\s/]+/.test(p.site_url) ? p.site_url.replace(/\/+$/, "") : null;
}

/** A page of the portal, or null when there is no safe origin or id. */
function page(p: OrderEmailPayload, path: string): string | null {
  const b = base(p);
  if (!b) return null;
  if (path.includes("{id}")) {
    if (!p.order_id || !/^[A-Za-z0-9_-]+$/.test(p.order_id)) return null;
    return b + path.replace("{id}", p.order_id);
  }
  return b + path;
}

const link = (label: string, href: string | null): EmailLink | undefined => (href ? { label, href } : undefined);

function money(minor: number | undefined, currency = "USD"): string {
  const major = (Number.isFinite(minor) ? (minor as number) : 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: major % 1 ? 2 : 0 }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/** "Fri, Oct 31, 2:45 PM ET": US Eastern is the primary zone for clients (owner, 31 Oct 2026). */
function eastern(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  return `${s} ET`;
}

const piece = (p: OrderEmailPayload) => esc(p.title?.trim() || "your design");
const ref = (p: OrderEmailPayload) => (p.order_ref ? `Order ${p.order_ref}` : undefined);
const subj = (s: string, p: OrderEmailPayload) => (p.order_ref ? `${s} · ${p.order_ref}` : s);

function build(subject: string, content: EmailContent) {
  return { subject, ...renderLayout(subject, content) };
}

/* -------------------------------------------------------------- templates */

type R = { subject: string; html: string; text: string };

const T: { [K in OrderEmailTemplate]: (p: OrderEmailPayloads[K]) => R } = {
  WELCOME: (p) => {
    const b = base(p);
    return build(`Welcome to ${BRAND}`, {
      preheader: "Send your first brief and get a fixed price within the hour.",
      heading: `Welcome, ${first(p.name)}.`,
      paragraphs: [
        "Your account is ready. Send a sketch or a photo with the size, metal and stones, and you'll have a fixed price within the hour. Nothing is charged until you accept it.",
        "Our AI models every piece and senior designers check every file against your brief and your factory's rules. Your first look arrives within 6 hours of confirmation, bulk orders included.",
      ],
      cta: link("Start your first design", b ? `${b}/orders/new` : null),
      secondary: { label: "Or WhatsApp us a photo", href: SUPPORT_WHATSAPP_LINK },
    });
  },

  ORDER_RECEIVED: (p) =>
    build(subj("We've received your brief", p), {
      preheader: "A fixed price is on its way within the hour.",
      eyebrow: ref(p),
      heading: "Your brief is with us.",
      paragraphs: [
        `Hi ${esc(first(p.name))}, thanks for sending ${piece(p)}. The team is reviewing it now and you'll have a fixed price within the hour.`,
        "Nothing is charged until you accept the price. If you think of a detail, add it in Messages and it goes straight to the team.",
      ],
      cta: link("View your order", page(p, "/orders/{id}")),
      secondary: link("Add a detail in Messages", page(p, "/messages/{id}")),
    }),

  QUOTE_READY: (p) => {
    const price = money(p.price, p.currency);
    const timing = p.deadline_hours
      ? `Your first look is due ${p.deadline_hours} hours after we confirm the order.`
      : "Your first look arrives within 6 hours of confirmation, or it's free.";
    return build(`Your price for ${p.title?.trim() || "your design"}: ${price}`, {
      preheader: "Pay when you're ready and we start straight away.",
      eyebrow: ref(p),
      heading: "Your quote is ready.",
      paragraphs: [`Hi ${esc(first(p.name))}, ${piece(p)} is quoted at <strong style="color:#0A0A0A">${esc(price)}</strong>. Pay when you're ready and we'll confirm the brief and begin.`, esc(timing)],
      facts: [
        ["Price", price],
        ["Includes", "3DM, STL, renders, spec and weight sheets"],
        ["Revisions", "2 rounds within 14 days"],
      ],
      cta: link("Review and pay", page(p, "/orders/{id}/pay")),
      secondary: link("Ask a question first", page(p, "/messages/{id}")),
    });
  },

  QUOTE_REMINDER: (p) =>
    build(subj("Your quote is waiting", p), {
      preheader: `${money(p.price, p.currency)}, ready when you are.`,
      eyebrow: ref(p),
      heading: "Ready when you are.",
      paragraphs: [
        `Your price of ${esc(money(p.price, p.currency))} for ${piece(p)} is still open. Pay to lock in your slot; the first look follows within 6 hours of confirmation.`,
        "Want something changed before you pay? Tell us in Messages and we'll update the quote.",
      ],
      cta: link("Review and pay", page(p, "/orders/{id}/pay")),
      secondary: link("Message the team", page(p, "/messages/{id}")),
      preferencesHref: page(p, "/account#email"),
      note: "You can turn off reminder emails in your preferences.",
    }),

  PAYMENT_RECEIVED: (p) =>
    build(subj("Payment received", p), {
      preheader: "Thank you. Next, the team confirms your brief.",
      eyebrow: ref(p),
      heading: "Payment received. Thank you.",
      paragraphs: [
        `We've received ${esc(money(p.price, p.currency))} for ${piece(p)}.`,
        "Next, the team confirms your brief. As soon as they do, the clock starts and we'll send you the time your first look is due.",
      ],
      cta: link("View your order", page(p, "/orders/{id}")),
    }),

  ORDER_CONFIRMED: (p) => {
    const due = eastern(p.due_at);
    return build(due ? `Confirmed: first look by ${due}` : subj("Your order is confirmed", p), {
      preheader: due ? "If we miss it, the full amount comes back as credit." : "Your design is in production.",
      eyebrow: ref(p),
      heading: "We're on it.",
      paragraphs: [
        `${piece(p)} is confirmed and in production.`,
        due
          ? `Your first look is due by <strong style="color:#0A0A0A">${esc(due)}</strong>. If we miss it, the full amount comes back as credit and we still finish your design.`
          : p.deadline_hours
            ? `Your first look is due within ${p.deadline_hours} hours.`
            : "We'll email you the moment your first look is ready.",
      ],
      cta: link("Track your order", page(p, "/orders/{id}")),
    });
  },

  FIRST_LOOK_READY: (p) =>
    build(`Your first look is ready: ${p.title?.trim() || "your design"}`, {
      preheader: "Approve it, or ask for changes.",
      eyebrow: ref(p),
      heading: "Your first look is ready.",
      paragraphs: [
        `Renders of ${piece(p)} are ready for you to review.`,
        "Approve it and we'll prepare your final files, or ask for changes: two revision rounds are included within 14 days.",
      ],
      cta: link("Review the design", page(p, "/orders/{id}/review")),
      secondary: link("Message the team", page(p, "/messages/{id}")),
    }),

  REVISION_RECEIVED: (p) =>
    build(subj("Changes received", p), {
      preheader: "Your notes are with the team.",
      eyebrow: ref(p),
      heading: "We've got your changes.",
      paragraphs: [`Your notes on ${piece(p)} are with the team. We'll email you as soon as the revised design is ready to review.`],
      cta: link("View your order", page(p, "/orders/{id}")),
    }),

  REVISED_DESIGN_READY: (p) =>
    build(`Your revised design is ready: ${p.title?.trim() || "your design"}`, {
      preheader: "Your changes are made. Have a look.",
      eyebrow: ref(p),
      heading: `Version ${p.version ?? 2} is ready.`,
      paragraphs: [`We've made your changes to ${piece(p)}. Approve it, or ask for anything else you'd like adjusted.`],
      cta: link("Review the design", page(p, "/orders/{id}/review")),
      secondary: link("Message the team", page(p, "/messages/{id}")),
    }),

  PREVIEW_REMINDER: (p) =>
    build(`${p.title?.trim() || "Your design"} is waiting for your review`, {
      preheader: "Approve it to get your final files.",
      eyebrow: ref(p),
      heading: "Your design is waiting for you.",
      paragraphs: [`Version ${p.version ?? 1} of ${piece(p)} is ready for review. Approve it to receive your final files, or ask for changes within your 14-day window.`],
      cta: link("Review the design", page(p, "/orders/{id}/review")),
      preferencesHref: page(p, "/account#email"),
      note: "You can turn off reminder emails in your preferences.",
    }),

  DESIGN_APPROVED: (p) =>
    build(`Approved: ${p.title?.trim() || "your design"}`, {
      preheader: "Your final files are being prepared.",
      eyebrow: ref(p),
      heading: "Approved. Final files are next.",
      paragraphs: [`Thank you for approving ${piece(p)}. We're preparing your final 3DM and STL files, spec sheet and weight sheet, and we'll email you the moment they're ready.`],
      cta: link("View your order", page(p, "/orders/{id}")),
    }),

  FILES_DELIVERED: (p) =>
    build(`Your final files are ready: ${p.title?.trim() || "your design"}`, {
      preheader: "3DM, STL, renders, spec sheet and weight sheet.",
      eyebrow: ref(p),
      heading: "Your files are ready to download.",
      paragraphs: [
        `${piece(p)} is complete. Download your 3DM and STL files, renders, signed spec sheet and weight sheet from your order.`,
        "If a file doesn't meet its spec sheet, raise it within 30 days and we'll fix it.",
      ],
      cta: link("Download your files", page(p, "/orders/{id}")),
      secondary: link("Start your next design", base(p) ? `${base(p)}/orders/new` : null),
    }),

  PROBLEM_RECEIVED: (p) =>
    build(subj("We've received your report", p), {
      preheader: "A senior member of the team is on it.",
      eyebrow: ref(p),
      heading: "We're looking into it.",
      paragraphs: [`Thank you for telling us about the problem with ${piece(p)}. A senior member of the team is reviewing it now and will reply in your order's messages.`],
      cta: link("Open Messages", page(p, "/messages/{id}")),
    }),

  ORDER_REFUNDED: (p) =>
    build(subj("Your refund is on its way", p), {
      preheader: "It can take a few working days to appear.",
      eyebrow: ref(p),
      heading: "Your refund is on its way.",
      paragraphs: [`We've refunded your payment for ${piece(p)}. Depending on your bank or payment method, it can take a few working days to appear.`],
      cta: link("View your order", page(p, "/orders/{id}")),
    }),

  ORDER_CANCELLED: (p) =>
    build(subj("Your order has been cancelled", p), {
      preheader: "If this wasn't expected, tell us and we'll sort it out.",
      eyebrow: ref(p),
      heading: "Your order has been cancelled.",
      paragraphs: [`${piece(p)} has been cancelled. If this wasn't what you expected, reply to this email or WhatsApp us and we'll sort it out.`],
      cta: link("View your order", page(p, "/orders/{id}")),
      secondary: link("Start a new design", base(p) ? `${base(p)}/orders/new` : null),
    }),

  ORDER_DELAYED: (p) =>
    build(subj("Your first look is running late", p), {
      preheader: "The full amount comes back as credit. We're still on it.",
      eyebrow: ref(p),
      heading: "We're running late, and you're covered.",
      paragraphs: [
        `The first look for ${piece(p)} wasn't ready by the time we promised. We're sorry.`,
        "Under our guarantee, the full amount comes back to you as credit, and we're finishing your design as a priority.",
      ],
      cta: link("Track your order", page(p, "/orders/{id}")),
      secondary: link("Message the team", page(p, "/messages/{id}")),
    }),

  CREDIT_DECIDED: (p) => {
    const amount = money(p.amount, p.credit_currency ?? p.currency);
    const refunded = p.decision === "refunded";
    return build(refunded ? subj(`${amount} refunded`, p) : `A credit of ${amount} for your next order`, {
      preheader: refunded ? "For your late first look." : "Applied to your next order automatically.",
      eyebrow: ref(p),
      heading: refunded ? "Your late-first-look refund." : "A credit for your next order.",
      paragraphs: [
        refunded
          ? `We've refunded ${esc(amount)} for the late first look on ${piece(p)}. It can take a few working days to appear.`
          : `We've added a credit of ${esc(amount)} for the late first look on ${piece(p)}. It comes off your next order automatically.`,
      ],
      cta: refunded ? link("View your order", page(p, "/orders/{id}")) : link("Start your next design", base(p) ? `${base(p)}/orders/new` : null),
    });
  },

  NEW_MESSAGE: (p) =>
    build(subj("New message from your team", p), {
      preheader: p.excerpt?.trim() || "Your team sent you a message.",
      eyebrow: ref(p),
      heading: "Your team sent you a message.",
      paragraphs: [`About ${piece(p)}:`],
      quote: p.excerpt?.trim() || undefined,
      cta: link("Reply", page(p, "/messages/{id}")),
      preferencesHref: page(p, "/account#email"),
      note: "You can turn off message emails in your preferences; messages stay in your portal.",
    }),

  FEEDBACK_REQUEST: (p) =>
    build(`How did ${p.title?.trim() || "your design"} turn out?`, {
      preheader: "Two lines from you help us make the next one better.",
      eyebrow: ref(p),
      heading: "How did it go?",
      paragraphs: [
        `It's been a few days since your files for ${piece(p)}. Did it cast cleanly? Was anything harder than it should have been?`,
        "Just reply to this email. Every note goes straight to the team.",
      ],
      cta: link("Start your next design", base(p) ? `${base(p)}/orders/new` : null),
      preferencesHref: page(p, "/account#email"),
      note: "You can turn off follow-up emails in your preferences.",
    }),
};

export function renderOrderEmail<K extends OrderEmailTemplate>(template: K, payload: OrderEmailPayloads[K]): R {
  return T[template](payload);
}
