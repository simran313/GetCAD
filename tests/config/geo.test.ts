import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import sitemap from "../../app/sitemap";
import { DELIVERABLES, FAQ } from "../../components/marketing/content";
import { CLAIMS, c } from "../../content/claims";
import { SITE_URL } from "../../lib/seo";

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
    for (const key of ["ENTRY_PRICE", "DESIGNER_COUNT", "MIN_EXPERIENCE_YEARS", "FIRST_LOOK_ACCURACY", "LIVE_CALL_HOURS", "EMAIL", "REVISIONS"] as const) {
      expect(CLAIMS[key].confirmed, `${key} must be confirmed before it is published`).toBe(true);
      expect(llms, key).toContain(String(c(key)));
    }
    expect(llms).toContain(`first look within ${c("FIRST_LOOK_HOURS")} hours of order confirmation`);
    expect(llms).toContain(`${c("CLAIM_WINDOW_DAYS")}-day window`);
    expect(llms).toContain(c("LIVE_CALL_PHONE")!);
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
  });
});
