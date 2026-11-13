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
  "The CAD Pillar (thecadpillar.com) is a jewelry CAD design service for jewelry brands, retailers and manufacturers: castable 3DM and STL files from your sketch or photo, a first look within 6 hours, checked by senior designers. From $35 a design.";

/**
 * The markets the business serves (docs/DECISIONS.md §1: USA first; UK,
 * Australia and Canada accepted). The studio is in India; nothing here
 * claims a local office.
 */
const AREAS_SERVED = [
  { "@type": "Country", name: "United States" },
  { "@type": "Country", name: "United Kingdom" },
  { "@type": "Country", name: "Australia" },
  { "@type": "Country", name: "Canada" },
];

/** The sharing image (Open Graph, X): made by scripts/og-image.mjs. */
export const OG_IMAGE = {
  url: "/og/the-cad-pillar-jewelry-cad.png",
  width: 1200,
  height: 630,
  alt: "The CAD Pillar: jewelry CAD design services for the trade",
};

const HOME = () => `${SITE_URL}/`;
const ORG_ID = () => `${HOME()}#organization`;
const WEBSITE_ID = () => `${HOME()}#website`;
export const SERVICE_ID = () => `${HOME()}#jewelry-cad-service`;

/** The organization, the same node wherever it appears. */
function organizationNode(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORG_ID(),
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAMES,
    legalName: LEGAL_NAME,
    url: HOME(),
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/pillar-512.png`, width: 512, height: 512 },
    image: `${SITE_URL}${OG_IMAGE.url}`,
    description: SITE_DESCRIPTION,
    slogan: "AI-native jewelry CAD. Checked by experts.",
    email: "simran@thecadpillar.com",
    areaServed: AREAS_SERVED,
    knowsAbout: [
      "Jewelry CAD design",
      "Custom jewelry CAD",
      "Jewelry CAD outsourcing",
      "3D jewelry modeling",
      "Jewelry rendering",
      "Engagement ring CAD design",
      "CAD for casting and 3D printing",
      "3DM and STL files",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: "simran@thecadpillar.com",
        telephone: "+91-83692-88293",
        areaServed: ["US", "GB", "AU", "CA"],
        availableLanguage: ["English"],
      },
    ],
  };
}

function websiteNode(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID(),
    url: HOME(),
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAMES,
    description: SITE_DESCRIPTION,
    inLanguage: "en-US",
    publisher: { "@id": ORG_ID() },
  };
}

/**
 * The service, described only with what the website already promises
 * (content/claims.ts, docs/DECISIONS.md §4, §6–§9): no ratings, no reviews.
 */
function serviceNode(): Record<string, unknown> {
  return {
    "@type": "Service",
    "@id": SERVICE_ID(),
    name: "Jewelry CAD design services",
    serviceType: "Jewelry CAD design",
    alternateName: ["Custom jewelry CAD design", "Jewelry CAD outsourcing", "Jewelry 3D modeling"],
    description:
      "Custom jewelry CAD for jewelry brands, retailers and manufacturers: manufacturing-ready 3DM and STL files from a sketch, photo or reference, render views, a signed spec sheet and a weight sheet. First look within 6 hours of order confirmation for standard pieces; two revision rounds included; white-label, NDA by default.",
    url: `${SITE_URL}/jewelry-cad`,
    provider: { "@id": ORG_ID() },
    brand: { "@id": ORG_ID() },
    areaServed: AREAS_SERVED,
    audience: { "@type": "BusinessAudience", audienceType: "Jewelry brands, retailers, custom jewelers and manufacturers" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "35",
      url: `${SITE_URL}/pricing`,
      description: "From $35 a design; a fixed price before you pay. Complex and sculpted pieces are quoted.",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Jewelry CAD services",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Custom jewelry CAD design (3DM and STL)" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Jewelry rendering" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Jewelry CAD outsourcing for brands and manufacturers" } },
      ],
    },
  };
}

/** One page's place under the home page. */
function breadcrumbNode(path: string, name: string): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    "@id": `${SITE_URL}${path}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: HOME() },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

/** The questions a page shows, exactly as shown. */
function faqNode(path: string, items: readonly (readonly [string, string])[]): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${path === "/" ? HOME() : `${SITE_URL}${path}`}#faq`,
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

const graph = (...nodes: Record<string, unknown>[]) => ({ "@context": "https://schema.org", "@graph": nodes });

/**
 * The home page's structured data: the site and its names, who runs it, the
 * service, and the questions it answers. Nothing here is shown on the page.
 */
export function siteJsonLd(faq: readonly (readonly [string, string])[] = []): Record<string, unknown> {
  return graph(websiteNode(), organizationNode(), serviceNode(), ...(faq.length ? [faqNode("/", faq)] : []));
}

/**
 * Any other public page: its breadcrumb, plus the service where the page is
 * about it, plus its questions where it shows some.
 */
export function pageJsonLd(
  path: string,
  name: string,
  extra: { service?: boolean; faq?: readonly (readonly [string, string])[] } = {},
): Record<string, unknown> {
  return graph(
    breadcrumbNode(path, name),
    ...(extra.service ? [serviceNode(), organizationNode()] : []),
    ...(extra.faq?.length ? [faqNode(path, extra.faq)] : []),
  );
}

/** Safe to put inside <script type="application/ld+json">: no "</script>" can close it early. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Consistent per-page metadata for website pages: title, description,
 * canonical, Open Graph and X cards with the sharing image. `absolute` keeps
 * a title as written instead of adding " | The CAD Pillar".
 */
export function pageMetadata(title: string, description: string, path: string, opts: { absolute?: boolean } = {}): Metadata {
  const url = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
  const shareTitle = opts.absolute ? title : `${title} | ${SITE_NAME}`;
  return {
    title: opts.absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: shareTitle,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
