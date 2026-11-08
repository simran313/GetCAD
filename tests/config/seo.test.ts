import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import robots, { PRIVATE_PATHS } from "../../app/robots";
import sitemap from "../../app/sitemap";
import { SITE_ALTERNATE_NAMES, SITE_NAME, SITE_URL, jsonLdString, siteJsonLd } from "../../lib/seo";

/**
 * Indexing and branded search (owner, 8 Nov 2026): the website is crawlable
 * and named as "The CAD Pillar" / "thecadpillar"; the product never is.
 */
const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("search engines see the website, never the product", () => {
  it("disallows every portal area in robots.txt, and points at the sitemap", () => {
    const areas = readdirSync(join(ROOT, "app/(app)"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `/${d.name}`);
    for (const a of areas) expect(PRIVATE_PATHS, `${a} must be disallowed`).toContain(a);
    const r = robots();
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("lets Google read the noindex on sign-in and sign-up instead of disallowing them", () => {
    expect(PRIVATE_PATHS).not.toContain("/sign-in");
    expect(PRIVATE_PATHS).not.toContain("/sign-up");
    expect(read("app/(auth)/layout.tsx")).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(read("app/(app)/layout.tsx")).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("lists each public page once, at the same URL as its canonical, with a fixed lastmod", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toBe(`${SITE_URL}/`);
    for (const e of entries) {
      expect(typeof e.lastModified).toBe("string");
      const path = e.url.slice(SITE_URL.length);
      if (path === "/") continue;
      const page = read(`app/(marketing)${path}/page.tsx`);
      expect(page, `${path} declares its canonical path`).toContain(`"${path}"`);
      expect(page).not.toMatch(/index:\s*false/);
    }
  });
});

describe("the brand's names in structured data", () => {
  it("names the site The CAD Pillar, with thecadpillar and The CAD Pillar jewelry CAD as alternates", () => {
    const graph = (siteJsonLd()["@graph"] as Record<string, unknown>[]);
    const site = graph.find((n) => n["@type"] === "WebSite")!;
    const org = graph.find((n) => n["@type"] === "Organization")!;
    expect(site).toMatchObject({ name: SITE_NAME, url: `${SITE_URL}/` });
    expect(SITE_ALTERNATE_NAMES).toEqual(expect.arrayContaining(["thecadpillar", "The CAD Pillar jewelry CAD"]));
    expect(org).toMatchObject({ name: SITE_NAME, legalName: "Ichizu Private Limited" });
    expect((org.logo as { url: string }).url).toBe(`${SITE_URL}/icons/pillar-512.png`);
  });

  it("is on the home page, brand first in its title, and cannot break out of its script tag", () => {
    const home = read("app/(marketing)/page.tsx");
    expect(home).toContain("application/ld+json");
    expect(home).toMatch(/absolute: "The CAD Pillar: jewelry CAD/);
    expect(jsonLdString({ a: "</script><b>" })).not.toContain("</script>");
  });
});
