/**
 * Email content, rendered here in the framework-free core so it can be unit
 * tested without a mail provider, a browser, or a database.
 *
 * WHY THIS IS THE ONLY PLACE BODIES ARE BUILT. The dispatcher (lib/email) knows
 * how to talk to a provider; it does not know what any email says. Keeping the
 * words here means the anonymity contract is checkable in one place: a template
 * receives only the fields in its payload type, so it CANNOT reference a
 * counterparty it was never given. Every template in this slice is addressed to
 * a person about their own action, so there is no counterparty at all — but the
 * shape is what will keep order-lifecycle emails honest when they arrive.
 *
 * Voice matches the site: plain, monochrome, no marketing gloss, no promises we
 * cannot keep (no "within 24 hours"). Both a text and an HTML part, because a
 * text/plain fallback is what keeps a transactional email out of spam.
 */

import { renderLayout } from "./layout";
import { ORDER_EMAIL_TEMPLATES, renderOrderEmail, type OrderEmailPayloads, type OrderEmailTemplate } from "./order";

export const EMAIL_TEMPLATES = [
  "DESIGNER_APPLICATION_RECEIVED",
  "CONTACT_RECEIVED",
  "DESIGNER_APPLICATION_ACCEPTED",
  "DESIGNER_APPLICATION_REJECTED",
  "PAYOUT_SENT",
  "ORDER_PLACED_FOR_YOU",
  // Client order emails (Phase 17, migration 0054): core/email/order.ts.
  ...ORDER_EMAIL_TEMPLATES,
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/** The exact payload each template accepts. The renderer will not build one it
 *  has no type for, so a template can never read a field it was not handed.
 *  Every payload here is about the RECIPIENT'S OWN thing — an application they
 *  filed, a payout owed to them — so none can carry a counterparty identity. */
export interface EmailPayloads extends OrderEmailPayloads {
  DESIGNER_APPLICATION_RECEIVED: { full_name?: string };
  CONTACT_RECEIVED: { name?: string };
  DESIGNER_APPLICATION_ACCEPTED: { full_name?: string };
  DESIGNER_APPLICATION_REJECTED: { full_name?: string };
  // A payout is the payee's own money for their own order. No client, no
  // designer-on-the-other-side — order_ref is an opaque id they already see.
  PAYOUT_SENT: { amount_minor?: number; currency?: string; order_ref?: string };
  // The client's own order, placed by the team from their message (0043).
  // site_url is added by the dispatcher, never stored in the outbox.
  ORDER_PLACED_FOR_YOU: { order_ref?: string; order_id?: string; channel?: string; site_url?: string };
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PRODUCT = "The CAD Pillar";

/** A safe first name for a greeting, or a neutral fallback. Never throws on a
 *  missing or junk value — a malformed name must not block an acknowledgement. */
function firstName(raw: string | undefined): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned.split(" ")[0] ?? "there";
}

/**
 * Format integer minor units for display. Mirrors lib/money's intent but stays
 * framework-free here so templates need no import: paise/cents → a major-unit
 * string with the currency's symbol, falling back to the ISO code.
 */
const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
function formatMinor(amountMinor: number | undefined, currency: string | undefined): string {
  const code = (currency ?? "INR").toUpperCase();
  const symbol = CURRENCY_SYMBOL[code] ?? "";
  const major = (Number.isFinite(amountMinor) ? (amountMinor as number) : 0) / 100;
  const shown = major.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${shown}` : `${shown} ${code}`;
}

/** Minimal HTML escape — payloads are user-supplied names. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The studio's shell (core/email/layout), shared with the order emails: the
 * heading is the subject without the brand, the preview line the first real
 * sentence.
 */
function layout(subject: string, paragraphs: string[], cta?: { label: string; href: string }): RenderedEmail {
  const heading = subject.replace(/ — The CAD Pillar$/, "");
  const preheader = (paragraphs[1] ?? paragraphs[0] ?? "").replace(/<[^>]+>/g, "").slice(0, 120);
  return { subject, ...renderLayout(subject, { preheader, heading, paragraphs, cta }) };
}

function designerApplicationReceived(p: EmailPayloads["DESIGNER_APPLICATION_RECEIVED"]): RenderedEmail {
  const name = firstName(p.full_name);
  return layout(`We've received your application — ${PRODUCT}`, [
    `Hi ${esc(name)},`,
    `Thanks for applying to design with ${esc(PRODUCT)}. We've received your application and it's now with our team for review.`,
    `We look at every application ourselves rather than auto-screening, so this takes a little time. If it's a fit, we'll be in touch about a short paid test order — that's how we get to know a designer's work before any client does.`,
    `You don't need to do anything else for now. If you applied by mistake or want to add something, just reply to this email.`,
  ]);
}

function contactReceived(p: EmailPayloads["CONTACT_RECEIVED"]): RenderedEmail {
  const name = firstName(p.name);
  return layout(`We've received your message — ${PRODUCT}`, [
    `Hi ${esc(name)},`,
    `Thanks for getting in touch with ${esc(PRODUCT)}. We've received your message and someone from our team will get back to you.`,
    `If it's urgent, you can reply directly to this email and it'll reach us.`,
  ]);
}

function designerApplicationAccepted(p: EmailPayloads["DESIGNER_APPLICATION_ACCEPTED"]): RenderedEmail {
  const name = firstName(p.full_name);
  return layout(`Your application to ${PRODUCT} — next steps`, [
    `Hi ${esc(name)},`,
    `Good news — we'd like to move forward with your application to design with ${esc(PRODUCT)}.`,
    `The next step is a short paid test order, so we can see how you work before you're matched with a client. We'll follow up from this address with the details and how to set up your account.`,
    `No action is needed right now — just keep an eye on your inbox. If you have questions in the meantime, reply here.`,
  ]);
}

function designerApplicationRejected(p: EmailPayloads["DESIGNER_APPLICATION_REJECTED"]): RenderedEmail {
  const name = firstName(p.full_name);
  return layout(`An update on your application to ${PRODUCT}`, [
    `Hi ${esc(name)},`,
    `Thank you for your interest in designing with ${esc(PRODUCT)}, and for the time you put into applying.`,
    `After reviewing your application, we're not able to move forward right now. This isn't a judgement of your work — we onboard a small number of designers at a time and can't take everyone on.`,
    `You're welcome to apply again in the future. We wish you the best with your work.`,
  ]);
}

function payoutSent(p: EmailPayloads["PAYOUT_SENT"]): RenderedEmail {
  const amount = formatMinor(p.amount_minor, p.currency);
  const ref = p.order_ref ? ` for order ${esc(p.order_ref)}` : "";
  return layout(`A payout of ${amount} is on its way — ${PRODUCT}`, [
    `Hi there,`,
    `A payout of ${amount}${ref} is on its way to your bank account.`,
    `Settlement to your bank usually takes a further working day or two. You can see the status of your payouts any time on your payout settings page.`,
  ]);
}

const CHANNEL_WORDS: Record<string, string> = {
  email: "your email",
  whatsapp: "your WhatsApp message",
  phone: "our call",
};

function orderPlacedForYou(p: EmailPayloads["ORDER_PLACED_FOR_YOU"]): RenderedEmail {
  const ref = p.order_ref ? ` ${esc(p.order_ref)}` : "";
  const from = CHANNEL_WORDS[p.channel ?? ""] ?? "your request";
  // Only a real https origin becomes a link; a missing or local one would
  // send the client somewhere broken.
  const base = p.site_url && /^https:\/\/[^\s/]+/.test(p.site_url) ? p.site_url.replace(/\/+$/, "") : null;
  const link =
    base && p.order_id && /^[A-Za-z0-9_-]+$/.test(p.order_id) ? `${base}/orders/${p.order_id}` : null;
  return layout(
    `Your order${ref} — ${PRODUCT}`,
    [
      `Hi there,`,
      `We've placed order${ref} for you from ${from}. You can follow it, answer questions and pay once it's quoted in your ${esc(PRODUCT)} portal.`,
      ...(link ? [] : [`Sign in to your ${esc(PRODUCT)} portal to see it.`]),
      `Sign in with this email address. No password is needed: we'll send you a code.`,
      `If something in the order isn't what you asked for, reply to this email or message us and we'll correct it before work starts.`,
    ],
    link ? { label: "Open your order", href: link } : undefined,
  );
}

/**
 * Render a template with its payload. Throws on an unknown template rather than
 * sending a blank email — a template the DB allows but the renderer doesn't
 * know is a bug to surface, not to paper over.
 */
export function renderEmail<T extends EmailTemplate>(
  template: T,
  payload: EmailPayloads[T],
): RenderedEmail {
  switch (template) {
    case "DESIGNER_APPLICATION_RECEIVED":
      return designerApplicationReceived(payload as EmailPayloads["DESIGNER_APPLICATION_RECEIVED"]);
    case "CONTACT_RECEIVED":
      return contactReceived(payload as EmailPayloads["CONTACT_RECEIVED"]);
    case "DESIGNER_APPLICATION_ACCEPTED":
      return designerApplicationAccepted(payload as EmailPayloads["DESIGNER_APPLICATION_ACCEPTED"]);
    case "DESIGNER_APPLICATION_REJECTED":
      return designerApplicationRejected(payload as EmailPayloads["DESIGNER_APPLICATION_REJECTED"]);
    case "PAYOUT_SENT":
      return payoutSent(payload as EmailPayloads["PAYOUT_SENT"]);
    case "ORDER_PLACED_FOR_YOU":
      return orderPlacedForYou(payload as EmailPayloads["ORDER_PLACED_FOR_YOU"]);
    default:
      if ((ORDER_EMAIL_TEMPLATES as readonly string[]).includes(template)) {
        return renderOrderEmail(template as OrderEmailTemplate, payload as OrderEmailPayloads[OrderEmailTemplate]);
      }
      throw new Error(`unknown email template: ${String(template)}`);
  }
}

/** Runtime guard for a value arriving from the database `template` column. */
export function isEmailTemplate(value: unknown): value is EmailTemplate {
  return typeof value === "string" && (EMAIL_TEMPLATES as readonly string[]).includes(value);
}
