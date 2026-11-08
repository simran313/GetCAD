import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// Public marketing routes only — the authenticated product is intentionally
// excluded (nothing there is meant for search engines; see robots.ts).
// /results stays out while the public_stats flag can make it a 404.
const ROUTES = [
  "/",
  "/jewelry-cad",
  "/how-it-works",
  "/pricing",
  "/guarantee",
  "/quality",
  "/faq",
  "/contact",
  "/apply-designer",
  "/privacy",
  "/terms",
];

/**
 * When the public pages last changed in a way worth recrawling. A fixed date,
 * not the request time: Google ignores a lastmod that is always "now". Move
 * it forward when the website's content changes.
 */
export const SITE_CONTENT_UPDATED = "2026-11-08";

export default function sitemap(): MetadataRoute.Sitemap {
  // Each URL exactly as its page's canonical ("https://thecadpillar.com/" for home).
  return ROUTES.map((path) => ({
    url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    lastModified: SITE_CONTENT_UPDATED,
  }));
}
