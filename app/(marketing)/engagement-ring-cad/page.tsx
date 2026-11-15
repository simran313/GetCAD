import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.engagementRing;

export const metadata: Metadata = pageMetadata(
  "Engagement Ring CAD Design for Jewelers",
  "Engagement ring CAD for jewelers: castable 3DM and STL from your sketch or photo, stone seats cut to your stones, first look in 6 hours, from $35.",
  "/engagement-ring-cad",
);

export default function EngagementRingCadPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { service: true, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
