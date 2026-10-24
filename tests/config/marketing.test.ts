import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECK_GROUPS, PRICE_BANDS } from "../../components/marketing/content";

/**
 * The website (Phase 6): the LANDING-COPY pages exist, the old marketplace
 * pages redirect, nothing off-message ships, and attribution is asked for.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

const PAGES = ["", "jewelry-cad", "how-it-works", "pricing", "guarantee", "quality", "faq", "terms", "privacy", "contact", "apply-designer"];

describe("the website", () => {
  it("has every page from LANDING-COPY", () => {
    for (const p of PAGES) expect(existsSync(join(root, "app/(marketing)", p, "page.tsx")), `/${p}`).toBe(true);
  });

  it("redirects the old pages to their replacements, permanently", () => {
    const config = read("next.config.mjs");
    const moved: [string, string][] = [
      ["/about", "/"],
      ["/security", "/guarantee"],
      ["/blog", "/"],
      ["/for-designers", "/apply-designer"],
      ["/quality-control", "/quality"],
    ];
    for (const [from, to] of moved) {
      expect(config).toContain(`source: "${from}", destination: "${to}", statusCode: 301`);
      expect(existsSync(join(root, "app/(marketing)", from.slice(1), "page.tsx")), from).toBe(false);
    }
  });

  // DECISIONS §1 and the C11 copy conflicts; LANDING-COPY placeholders.
  it("says nothing off-message: no marketplace, escrow, TCC, testimonials or stats", () => {
    const files = [...walk("app/(marketing)"), ...walk("components/marketing")].filter((f) => /\.(tsx?|md)$/.test(f));
    for (const f of files) {
      const text = read(f);
      expect(text, f).not.toMatch(/marketplace|double-blind|escrow|vetted designers|\bTCC\b|The CAD Co\b/i);
      expect(text, f).not.toMatch(/testimonial|trusted by \d|\d+\+ (jewelers|clients)/i);
    }
  });

  it("prices come from DECISIONS §4", () => {
    expect(PRICE_BANDS.map((b) => b.price)).toEqual(["$55", "$85", "From $120", "$49"]);
  });

  it("lists 19 checks in 7 groups", () => {
    expect(CHECK_GROUPS).toHaveLength(7);
    expect(CHECK_GROUPS.flatMap((g) => g.checks)).toHaveLength(19);
  });
});

describe("attribution (Q16: our own database)", () => {
  it("keeps the first touch in a first-party cookie, set by the middleware", () => {
    const mw = read("middleware.ts");
    expect(mw).toContain("FIRST_TOUCH_COOKIE");
    expect(mw).toContain("httpOnly: true");
  });

  it("asks 'How did you hear about us?' at sign-up, as a required question", () => {
    const form = read("app/(app)/account/ClientProfileForm.tsx");
    expect(form).toMatch(/name="heard_about" required/);
    expect(read("app/(app)/welcome/page.tsx")).toContain("askHeardAbout");
  });

  it("loads no third-party analytics", () => {
    const files = [...walk("app"), ...walk("components")].filter((f) => /\.tsx?$/.test(f));
    for (const f of files) expect(read(f), f).not.toMatch(/googletagmanager|gtag\(|posthog|plausible\.io|segment\.com/i);
  });
});
