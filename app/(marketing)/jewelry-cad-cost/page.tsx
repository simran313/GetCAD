import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.cost;

export const metadata: Metadata = pageMetadata(
  "How Much Does Jewelry CAD Cost? (2026)",
  "Jewelry CAD costs from $35 a design at The CAD Pillar, fixed before you pay; renders from $15; repairs quoted. What drives the price and how to save.",
  "/jewelry-cad-cost",
);

export default function JewelryCadCostPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
