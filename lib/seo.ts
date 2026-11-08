import type { Metadata } from "next";

// Public, non-secret. Used only to build absolute canonical/OG URLs and the
// sitemap. Falls back to localhost so nothing breaks if unset; set the real
// production domain via NEXT_PUBLIC_SITE_URL when one exists.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "The CAD Pillar";

/**
 * The names people search for the brand (owner, 8 Nov 2026: "thecadpillar",
 * "The CAD Pillar", "The CAD Pillar jewelry CAD"). Google reads the site's
 * name and its alternates from the WebSite structured data on the home page.
 */
export const SITE_ALTERNATE_NAMES = ["thecadpillar", "CAD Pillar", "The CAD Pillar jewelry CAD", "thecadpillar.com"];
export const LEGAL_NAME = "Ichizu Private Limited";
export const SITE_DESCRIPTION =
  "The CAD Pillar (thecadpillar.com) is an AI-native jewelry CAD studio: factory-ready jewelry CAD files, first look within 6 hours, checked by senior designers. From $35 a design.";

/**
 * WebSite + Organization structured data for the home page (schema.org,
 * JSON-LD). Nothing here is shown on the page; it tells search engines the
 * site's name, its alternate names, who runs it and its logo.
 */
export function siteJsonLd(): Record<string, unknown> {
  const home = `${SITE_URL}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${home}#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        legalName: LEGAL_NAME,
        url: home,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/pillar-512.png`, width: 512, height: 512 },
        description: SITE_DESCRIPTION,
        knowsAbout: ["Jewelry CAD", "Jewellery CAD design", "3D jewelry modelling", "CAD for casting", "Jewelry rendering"],
        email: "simran@thecadpillar.com",
      },
    ],
  };
}

/** Safe to put inside <script type="application/ld+json">: no "</script>" can close it early. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Consistent per-page metadata: title, description, canonical + OG, for marketing pages. */
export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
  };
}
