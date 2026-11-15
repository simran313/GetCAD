import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.forJewelers;

export const metadata: Metadata = pageMetadata(
  "Outsource Jewelry CAD for Jewelers",
  "White-label jewelry CAD outsourcing for jewelers, retailers and manufacturers: NDA by default, your naming, first look in 6 hours, from $35 a design.",
  "/for-jewelers",
);

export default function ForJewelersPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { service: true, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
