import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.files;

export const metadata: Metadata = pageMetadata(
  "Jewelry STL and 3DM Files for Casting",
  "Every design as an editable Rhino 3DM and a print-ready STL for casting, with a signed spec sheet and a weight sheet. From $35, first look in 6 hours.",
  "/jewelry-stl-3dm-files",
);

export default function JewelryFilesPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { service: true, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
