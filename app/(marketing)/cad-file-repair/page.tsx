import type { Metadata } from "next";

import { ServicePage } from "@/components/marketing/service-page";
import { SERVICE_PAGES } from "@/components/marketing/service-pages";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

const page = SERVICE_PAGES.repair;

export const metadata: Metadata = pageMetadata(
  "Jewelry CAD File Repair: STL and 3DM",
  "Repair of jewelry STL and 3DM files from any designer: broken geometry, non-manifold meshes, thin walls and casting problems. Quoted after review.",
  "/cad-file-repair",
);

export default function CadFileRepairPage() {
  return (
    <>
      <JsonLd data={pageJsonLd(page.path, page.name, { ownService: page.service, faq: page.faq })} />
      <ServicePage page={page} />
    </>
  );
}
