import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.compare;

export const metadata: Metadata = pageMetadata(
  "Jewelry CAD Service vs Freelancers vs In-House",
  "Compare a jewelry CAD service, freelance designers and an in-house CAD designer on price, speed, quality checks, files and confidentiality.",
  "/compare",
);

export default function CompareJewelryCadPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
