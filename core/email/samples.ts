/**
 * Sample data for every email (Phase 17): what the admin preview page renders
 * and the tests check. Invented, never a real client.
 */
import type { EmailPayloads, EmailTemplate } from "./templates";

const order = {
  name: "Maya Fischer",
  order_id: "ord_sample_7Hq2",
  order_ref: "MF1-RN-C-24",
  title: "Halo engagement ring",
  price: 5500,
  currency: "USD",
  version: 1,
  due_at: "2026-11-03T19:45:00.000Z",
  deadline_hours: null,
};

export function samplePayloads(siteUrl: string): { [K in EmailTemplate]: EmailPayloads[K] } {
  const o = { ...order, site_url: siteUrl };
  return {
    DESIGNER_APPLICATION_RECEIVED: { full_name: "Dana Reyes" },
    CONTACT_RECEIVED: { name: "Priya Shah" },
    DESIGNER_APPLICATION_ACCEPTED: { full_name: "Dana Reyes" },
    DESIGNER_APPLICATION_REJECTED: { full_name: "Sam Okafor" },
    PAYOUT_SENT: { amount_minor: 3_000_000, currency: "INR", order_ref: "RN-C-24" },
    ORDER_PLACED_FOR_YOU: { order_ref: o.order_ref, order_id: o.order_id, channel: "whatsapp", site_url: siteUrl },
    WELCOME: { name: o.name, site_url: siteUrl },
    ORDER_RECEIVED: o,
    QUOTE_READY: o,
    QUOTE_REMINDER: o,
    PAYMENT_RECEIVED: o,
    ORDER_CONFIRMED: o,
    FIRST_LOOK_READY: o,
    REVISION_RECEIVED: o,
    REVISED_DESIGN_READY: { ...o, version: 2 },
    PREVIEW_REMINDER: o,
    DESIGN_APPROVED: o,
    FILES_DELIVERED: o,
    PROBLEM_RECEIVED: o,
    ORDER_REFUNDED: o,
    ORDER_CANCELLED: o,
    ORDER_DELAYED: o,
    CREDIT_DECIDED: { ...o, decision: "apply_next", amount: 5500, credit_currency: "USD" },
    NEW_MESSAGE: { ...o, excerpt: "The prongs are now 0.8 mm as you asked. Shall we raise the halo by 0.3 mm too?" },
    FEEDBACK_REQUEST: o,
  };
}
