import { describe, expect, it } from "vitest";

import { ORDER_EMAIL_TEMPLATES } from "./order";
import { samplePayloads } from "./samples";
import { EMAIL_TEMPLATES, renderEmail } from "./templates";

const SITE = "https://thecadpillar.com";
const samples = samplePayloads(SITE);
const id = "ord_sample_7Hq2";
const cta = (html: string) => html.match(/<a href="([^"]+)"[^>]*display:inline-block/)?.[1];

describe("client order emails (Phase 17)", () => {
  it("every template renders a subject, a preview line, a heading and both parts", () => {
    for (const t of EMAIL_TEMPLATES) {
      const r = renderEmail(t, samples[t] as never);
      expect(r.subject.length, t).toBeGreaterThan(5);
      expect(r.html, t).toMatch(/^<!doctype html>/i);
      expect(r.html, t).toMatch(/<h1 /);
      expect(r.text, t).toContain("The CAD Pillar");
    }
  });

  it("each button opens the exact page, never a generic dashboard", () => {
    const expected: Record<string, string> = {
      WELCOME: `${SITE}/orders/new`,
      ORDER_RECEIVED: `${SITE}/orders/${id}`,
      QUOTE_READY: `${SITE}/orders/${id}/pay`,
      QUOTE_REMINDER: `${SITE}/orders/${id}/pay`,
      PAYMENT_RECEIVED: `${SITE}/orders/${id}`,
      ORDER_CONFIRMED: `${SITE}/orders/${id}`,
      FIRST_LOOK_READY: `${SITE}/orders/${id}/review`,
      REVISION_RECEIVED: `${SITE}/orders/${id}`,
      REVISED_DESIGN_READY: `${SITE}/orders/${id}/review`,
      PREVIEW_REMINDER: `${SITE}/orders/${id}/review`,
      DESIGN_APPROVED: `${SITE}/orders/${id}`,
      FILES_DELIVERED: `${SITE}/orders/${id}`,
      PROBLEM_RECEIVED: `${SITE}/messages/${id}`,
      ORDER_REFUNDED: `${SITE}/orders/${id}`,
      ORDER_CANCELLED: `${SITE}/orders/${id}`,
      ORDER_DELAYED: `${SITE}/orders/${id}`,
      CREDIT_DECIDED: `${SITE}/orders/new`,
      NEW_MESSAGE: `${SITE}/messages/${id}`,
      FEEDBACK_REQUEST: `${SITE}/orders/new`,
    };
    for (const t of ORDER_EMAIL_TEMPLATES) {
      expect(cta(renderEmail(t, samples[t] as never).html), t).toBe(expected[t]);
    }
  });

  it("states the first-look time in US Eastern Time", () => {
    const r = renderEmail("ORDER_CONFIRMED", samples.ORDER_CONFIRMED);
    expect(r.subject).toBe("Confirmed: first look by Tue, Nov 3, 2:45 PM ET");
  });

  it("names the price and keeps the client's own piece name, escaped", () => {
    const r = renderEmail("QUOTE_READY", { ...samples.QUOTE_READY, title: "<b>Halo</b>" });
    expect(r.subject).toContain("$55");
    expect(r.html).not.toContain("<b>Halo</b>");
    expect(r.html).toContain("&lt;b&gt;Halo&lt;/b&gt;");
  });

  it("only links to an https portal, so a misconfigured address never sends a client somewhere broken", () => {
    const r = renderEmail("QUOTE_READY", { ...samples.QUOTE_READY, site_url: "http://localhost:3000" });
    expect(cta(r.html)).toBeUndefined();
  });

  it("offers the preferences link only on emails a client may turn off", () => {
    const optional = new Set(["QUOTE_REMINDER", "PREVIEW_REMINDER", "NEW_MESSAGE", "FEEDBACK_REQUEST"]);
    for (const t of ORDER_EMAIL_TEMPLATES) {
      expect(renderEmail(t, samples[t] as never).html.includes("Email preferences"), t).toBe(optional.has(t));
    }
  });

  it("never names anyone on the team: the client hears from 'your team'", () => {
    const r = renderEmail("NEW_MESSAGE", samples.NEW_MESSAGE);
    expect(r.html).toContain("Your team sent you a message");
    expect(r.html).not.toMatch(/Team ·|designer [A-Z]/);
  });
});

describe("the email catalog", () => {
  it("describes every template exactly once", async () => {
    const { EMAIL_CATALOG } = await import("./catalog");
    expect(EMAIL_CATALOG.map((e) => e.template).sort()).toEqual([...EMAIL_TEMPLATES].sort());
  });
});
