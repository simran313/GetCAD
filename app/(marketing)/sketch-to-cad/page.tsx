import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.sketch;

export const metadata: Metadata = pageMetadata(
  "Jewelry Sketch or Photo to CAD",
  "Turn a jewelry sketch, photo or reference into castable 3DM and STL files: a fixed price within the hour, first look in 6 hours, from $35 a design.",
  "/sketch-to-cad",
);

export default function SketchToCadPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { service: true, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
