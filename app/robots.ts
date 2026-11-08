import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/**
 * The website is open to crawlers; the product is not. Portal routes answer a
 * signed-out visitor with a 404 marked noindex, and are disallowed here so no
 * crawl budget goes on them.
 *
 * /sign-in and /sign-up are NOT disallowed (8 Nov 2026): a disallowed URL
 * that the site links to can still be indexed as a bare link, because Google
 * cannot read its noindex. Allowed, Google reads their noindex and drops them.
 */
export const PRIVATE_PATHS = [
  "/home",
  "/welcome",
  "/messages",
  "/wallet",
  "/files",
  "/dashboard",
  "/orders",
  "/admin",
  "/onboarding",
  "/work",
  "/qc",
  "/pod",
  "/account",
  "/materials",
  "/settings",
  "/tools",
  "/p/",
  "/api/",
  "/design-preview",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
