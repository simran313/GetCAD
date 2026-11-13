import type { Metadata } from "next";
import Link from "next/link";

import { FAQ } from "@/components/marketing/content";
import { Faq, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Jewelry CAD Services FAQ",
  "Answers for jewelers outsourcing CAD: turnaround, 3DM and STL files, design ownership and NDA, revisions, US-dollar pricing, and working from a sketch or photo.",
  "/faq",
);

export default function FaqPage() {
  return (
    <>
      <JsonLd data={pageJsonLd("/faq", "FAQ", { faq: FAQ })} />
      <Hero eyebrow="FAQ" title="Questions jewelers ask us." />
      <Section>
        <Faq items={FAQ} />
        <p className="mt-8 text-[length:var(--fs-3)]">
          Something else?{" "}
          <Link href="/contact" className="underline underline-offset-4">
            Ask us
          </Link>
          .
        </p>
      </Section>
      <FinalCta />
    </>
  );
}
