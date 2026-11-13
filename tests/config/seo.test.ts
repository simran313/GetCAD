import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import robots, { PRIVATE_PATHS } from "../../app/robots";
import sitemap from "../../app/sitemap";
import { FAQ } from "../../components/marketing/content";
import { OG_IMAGE, SITE_ALTERNATE_NAMES, SITE_NAME, SITE_URL, jsonLdString, pageJsonLd, pageMetadata, siteJsonLd } from "../../lib/seo";

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
    expect(home).toContain("<JsonLd data={siteJsonLd(faq)} />");
    expect(home).toMatch(/"The CAD Pillar: jewelry CAD, factory-ready in hours",[\s\S]*?absolute: true/);
    expect(jsonLdString({ a: "</script><b>" })).not.toContain("</script>");
  });
});

/**
 * US search optimisation (12 Nov 2026): every website page has its own title
 * and description, a sharing image, and structured data that says only what
 * the website itself says.
 */
const PAGES = [
  "page.tsx",
  "jewelry-cad/page.tsx",
  "how-it-works/page.tsx",
  "pricing/page.tsx",
  "guarantee/page.tsx",
  "quality/page.tsx",
  "faq/page.tsx",
  "contact/page.tsx",
  "apply-designer/page.tsx",
  "privacy/page.tsx",
  "terms/page.tsx",
];
const metaOf = (file: string) => {
  const src = read(`app/(marketing)/${file}`);
  const m = src.match(/pageMetadata\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"(,\s*\{\s*absolute:\s*true\s*\})?/);
  if (!m) throw new Error(`${file}: no pageMetadata("title", "description", "/path")`);
  const [, raw = "", description = "", path = "", absolute] = m;
  const title = absolute ? raw : `${raw} | ${SITE_NAME}`;
  return { src, title, description, path };
};

describe("website page metadata", () => {
  const metas = PAGES.map((f) => ({ file: f, ...metaOf(f) }));

  it("gives every page its own title and description, sized for search results", () => {
    expect(new Set(metas.map((m) => m.title)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.description)).size).toBe(metas.length);
    for (const m of metas) {
      expect(m.title.length, `${m.file} title: ${m.title}`).toBeLessThanOrEqual(65);
      expect(m.description.length, `${m.file} description`).toBeGreaterThanOrEqual(50);
      expect(m.description.length, `${m.file} description`).toBeLessThanOrEqual(160);
      expect(m.title + m.description, `${m.file}: US spelling`).not.toMatch(/jewellery|modelling/i);
    }
  });

  it("keeps the canonical paths and the brand-first home title", () => {
    expect(metas.map((m) => m.path)).toEqual(["/", "/jewelry-cad", "/how-it-works", "/pricing", "/guarantee", "/quality", "/faq", "/contact", "/apply-designer", "/privacy", "/terms"]);
    expect(metas[0]!.title).toBe("The CAD Pillar: jewelry CAD, factory-ready in hours");
  });

  it("shares with the large image and a branded title on every page", () => {
    const md = pageMetadata("Pricing", "A description long enough to count as one.", "/pricing");
    expect(md.openGraph).toMatchObject({ title: `Pricing | ${SITE_NAME}`, url: `${SITE_URL}/pricing`, images: [OG_IMAGE] });
    expect(md.twitter).toMatchObject({ card: "summary_large_image", images: [OG_IMAGE.url] });
    expect(md.alternates).toEqual({ canonical: `${SITE_URL}/pricing` });
    expect(existsSync(join(ROOT, "public", OG_IMAGE.url))).toBe(true);
  });

  it("puts structured data on every website page", () => {
    for (const m of metas) expect(m.src, m.file).toMatch(/<JsonLd data=\{(siteJsonLd|pageJsonLd)\(/);
  });
});

describe("structured data says only what the website says", () => {
  const nodes = (g: Record<string, unknown>) => g["@graph"] as Record<string, unknown>[];

  it("describes the service once, with one organization, and the home page's questions", () => {
    const g = nodes(siteJsonLd(FAQ));
    expect(g.map((n) => n["@type"])).toEqual(["WebSite", "Organization", "Service", "FAQPage"]);
    const service = g.find((n) => n["@type"] === "Service")!;
    expect(service.provider).toEqual({ "@id": `${SITE_URL}/#organization` });
    expect(service.offers).toMatchObject({ priceCurrency: "USD", lowPrice: "35" });
    const faq = g.find((n) => n["@type"] === "FAQPage")!;
    expect((faq.mainEntity as unknown[]).length).toBe(FAQ.length);
  });

  it("gives each page a two-step breadcrumb from the home page", () => {
    const [crumb] = nodes(pageJsonLd("/pricing", "Pricing"));
    expect(crumb).toMatchObject({ "@type": "BreadcrumbList" });
    expect(crumb!.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pricing", item: `${SITE_URL}/pricing` },
    ]);
  });

  it("claims no address, rating or review, and stays valid JSON", () => {
    const all = JSON.stringify([siteJsonLd(FAQ), pageJsonLd("/jewelry-cad", "Jewelry CAD services", { service: true }), pageJsonLd("/faq", "FAQ", { faq: FAQ })]);
    expect(all).not.toMatch(/"(address|aggregateRating|review|ratingValue|foundingDate|numberOfEmployees)"/);
    expect(() => JSON.parse(jsonLdString(JSON.parse(all)))).not.toThrow();
  });
});
