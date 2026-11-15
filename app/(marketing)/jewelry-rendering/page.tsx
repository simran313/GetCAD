import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.rendering;

export const metadata: Metadata = pageMetadata(
  "Jewelry Rendering Services from $15",
  "Photo-real jewelry renders from your own 3DM or STL, from $15 a design, quoted before you pay. Render views come with every CAD order we model.",
  "/jewelry-rendering",
);

export default function JewelryRenderingPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { ownService: page.service, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
