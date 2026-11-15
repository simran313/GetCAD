import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import sitemap from "../../app/sitemap";
import { DELIVERABLES, FAQ } from "../../components/marketing/content";
import { SERVICE_PAGE_LIST } from "../../components/marketing/service-pages";
import { CLAIMS, c } from "../../content/claims";
import { SITE_URL, SOCIAL_PROFILES, pageJsonLd, siteJsonLd } from "../../lib/seo";

/**
 * AI search (GEO, 15 Nov 2026): llms.txt is a plain-text summary for AI
 * assistants. It may only repeat what the website already says, so a price or
 * promise changed on the site cannot leave a stale copy here.
 */
const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const llms = read("public/llms.txt");
/** The key in the submit script (read as text: importing it would run it). */
const INDEXNOW_KEY = read("scripts/indexnow.mjs").match(/INDEXNOW_KEY = "([^"]+)"/)?.[1] ?? "";

describe("llms.txt", () => {
  it("follows the llms.txt layout: one title, a summary quote, sections of links", () => {
    expect(llms.startsWith("# The CAD Pillar\n")).toBe(true);
    expect(llms.match(/^# /gm)).toHaveLength(1);
    expect(llms).toMatch(/^> .+/m);
    expect(llms).toMatch(/^## Pages$/m);
  });

  it("states the website's current claims, word for word", () => {
    for (const key of ["ENTRY_PRICE", "DESIGNER_COUNT", "MIN_EXPERIENCE_YEARS", "FIRST_LOOK_ACCURACY", "LIVE_CALL_HOURS", "EMAIL", "REVISIONS", "SOFTWARE"] as const) {
      expect(CLAIMS[key].confirmed, `${key} must be confirmed before it is published`).toBe(true);
      expect(llms, key).toContain(String(c(key)));
    }
    expect(llms).toContain(`first look within ${c("FIRST_LOOK_HOURS")} hours of order confirmation`);
    expect(llms).toContain(`${c("CLAIM_WINDOW_DAYS")}-day window`);
    expect(llms).toContain(c("LIVE_CALL_PHONE")!);
    expect(llms).toContain(`from ${c("RENDER_ONLY_PRICE")} a design`);
  });

  it("lists every deliverable and the facts the FAQ gives", () => {
    expect(llms).toContain("3DM + STL ready for printing and casting");
    expect(llms).toContain(DELIVERABLES[3]!.replace("A weight sheet", "a weight sheet"));
    const faq = Object.fromEntries(FAQ);
    expect(faq["Where are you based?"]).toContain("Mumbai, India");
    expect(llms).toContain("Mumbai, India");
    expect(faq["Do you work with consumers?"]).toMatch(/^No\./);
    expect(llms).toContain("not consumers");
  });

  it("links only to public pages that are in the sitemap", () => {
    const published = new Set(sitemap().map((e) => e.url));
    const links = [...llms.matchAll(/\]\((https:\/\/thecadpillar\.com[^)]*)\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(5);
    for (const url of links) expect(published.has(url.replace("https://thecadpillar.com", SITE_URL)), url).toBe(true);
  });

  it("claims no rating, review, client name or office address", () => {
    expect(llms).not.toMatch(/\bratings?\b|\breviews?\b|\bstars?\b|trusted by|clients include/i);
    expect(llms).not.toMatch(/\b(suite|street|avenue|road)\b/i);
  });
});

describe("IndexNow", () => {
  it("serves the key the submit script sends, from the site root", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(read(`public/${INDEXNOW_KEY}.txt`)).toBe(INDEXNOW_KEY);
  });

  it("runs after website changes reach main, with no secrets", () => {
    const wf = read(".github/workflows/indexnow.yml");
    expect(wf).toMatch(/branches: \[main\]/);
    expect(wf).toContain("public/llms.txt");
    expect(wf).toContain("node scripts/indexnow.mjs --wait");
    expect(wf).not.toMatch(/secrets\./);
  });
});

describe("Bing verification", () => {
  it("adds the msvalidate.01 tag only when the owner sets the token", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/"msvalidate\.01": process\.env\.NEXT_PUBLIC_BING_SITE_VERIFICATION/);
    expect(layout).toMatch(/process\.env\.NEXT_PUBLIC_BING_SITE_VERIFICATION\s*\?/);
    expect(layout).toMatch(/"p:domain_verify": process\.env\.NEXT_PUBLIC_PINTEREST_DOMAIN_VERIFY/);
    expect(layout).toMatch(/"facebook-domain-verification": process\.env\.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION/);
  });
});

/**
 * The service and guide pages (AI search, phase 2, 15 Nov 2026): one per
 * search intent, each reachable from every page, listed for AI assistants,
 * and saying only what the owner confirmed.
 */
describe("service and guide pages", () => {
  const footer = read("components/marketing/marketing-footer.tsx");
  const published = new Set(sitemap().map((e) => e.url));

  it("are in the sitemap, the footer and llms.txt, each with its own route file", () => {
    for (const p of SERVICE_PAGE_LIST) {
      expect(published.has(`${SITE_URL}${p.path}`), p.path).toBe(true);
      expect(footer, p.path).toContain(`href: "${p.path}"`);
      expect(llms, p.path).toContain(`(https://thecadpillar.com${p.path})`);
      expect(read(`app/(marketing)${p.path}/page.tsx`)).toContain(`"${p.path}"`);
    }
  });

  it("answer first, then facts, sections and at least three questions", () => {
    for (const p of SERVICE_PAGE_LIST) {
      expect(p.answer.length, `${p.path} answer`).toBeGreaterThan(120);
      expect(p.answer.length, `${p.path} answer`).toBeLessThan(420);
      expect(p.facts.length, p.path).toBeGreaterThanOrEqual(3);
      expect(p.sections.length, p.path).toBeGreaterThanOrEqual(2);
      expect(p.faq.length, p.path).toBeGreaterThanOrEqual(3);
      for (const r of p.related) expect(published.has(`${SITE_URL}${r.href}`), `${p.path} links ${r.href}`).toBe(true);
    }
  });

  it("never show the internal price bands, and use US spelling", () => {
    const text = JSON.stringify(SERVICE_PAGE_LIST);
    expect(text).not.toMatch(/\$(55|85|49|120)\b/);
    expect(text).not.toMatch(/jewellery|modelling|colour|licence|optimis|centre/i);
  });

  it("describe rendering and file repair as services of their own, with no rating or address", () => {
    const rendering = SERVICE_PAGE_LIST.find((p) => p.path === "/jewelry-rendering")!;
    const g = pageJsonLd(rendering.path, rendering.name, { ownService: rendering.service, faq: rendering.faq })["@graph"] as Record<string, unknown>[];
    const service = g.find((n) => n["@type"] === "Service")!;
    expect(service).toMatchObject({ name: "Jewelry rendering", offers: { priceCurrency: "USD", lowPrice: "15" } });
    expect(g.find((n) => n["@type"] === "FAQPage")).toBeTruthy();
    expect(JSON.stringify(g)).not.toMatch(/"(address|aggregateRating|review|ratingValue)"/);
  });
});

describe("the company's profiles", () => {
  it("are tied to the organization (sameAs), linked from the footer and listed in llms.txt", () => {
    const org = (siteJsonLd()["@graph"] as Record<string, unknown>[]).find((n) => n["@type"] === "Organization")!;
    expect(org.sameAs).toEqual(SOCIAL_PROFILES.map((p) => p.url));
    expect(SOCIAL_PROFILES.map((p) => p.name)).toEqual(["LinkedIn", "Instagram", "Facebook", "Pinterest"]);
    for (const p of SOCIAL_PROFILES) {
      expect(p.url).toMatch(/^https:\/\/www\./);
      expect(llms).toContain(`(${p.url})`);
    }
    expect(read("components/marketing/marketing-footer.tsx")).toMatch(/rel="me noopener noreferrer"/);
  });
});
