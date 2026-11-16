import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { JsonLd } from "@/components/seo/json-ld";
import { c } from "@/content/claims";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Delivery Policy: Digital Files Worldwide",
  "How The CAD Pillar delivers jewelry CAD files and renders: digitally, through your portal, worldwide. Nothing physical is shipped.",
  "/delivery-policy",
);

/**
 * Delivery (payments readiness, 16 Nov 2026): the service is digital, so the
 * "shipping and delivery" policy payment providers ask for says how and when
 * files are delivered (DECISIONS §6, §8, §9).
 */
const SECTIONS = [
  {
    heading: "What we deliver",
    body: [
      "Our service is digital. We deliver files: 3DM and STL files, render images, a technical sheet, a summary sheet, a signed spec sheet, a weight sheet and a 3D preview link. Nothing is sent by post or courier, so there are no shipping charges.",
    ],
  },
  {
    heading: "How you receive it",
    body: [
      "Everything is delivered in your account on thecadpillar.com: you see the first look, approve it or ask for changes, and download the final files from the order and the Files page. We email you when something is ready. You can sign in from anywhere in the world.",
    ],
  },
  {
    heading: "When",
    body: [
      `For standard pieces, the first look is shared within ${c("FIRST_LOOK_HOURS")} hours of the order being paid and confirmed. Complex pieces get a firm deadline with their price. Final files are released once you approve the work. ${c("REVISIONS").charAt(0).toUpperCase()}${c("REVISIONS").slice(1)} are included.`,
    ],
  },
  {
    heading: "Where we deliver",
    body: [
      "We serve jewelry businesses in the United States first, and in the UK, Australia and Canada; because delivery is digital, the location of your business does not change how or when you receive files. Prices are in US dollars.",
    ],
  },
  {
    heading: "If you cannot download a file",
    body: [
      `Message us on the order or at ${c("EMAIL")}. We can send the file again; a delivered file is archived and fingerprinted, so the copy is identical.`,
    ],
  },
];

export default function DeliveryPolicyPage() {
  return (
    <>
      <JsonLd data={pageJsonLd("/delivery-policy", "Delivery policy")} />
      <LegalPage
        title="Delivery policy"
        updated="November 2026"
        intro="How and when we deliver your files. Everything is digital; nothing is shipped."
        sections={SECTIONS}
        draft={false}
      />
    </>
  );
}
