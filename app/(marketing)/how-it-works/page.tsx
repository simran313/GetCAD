import type { Metadata } from "next";

import { DELIVERABLES, STEPS } from "@/components/marketing/content";
import { Ctas, FinalCta, Hero, NumberedList, Section, Ticks } from "@/components/marketing/blocks";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "How Jewelry CAD Outsourcing Works",
  "Outsource jewelry CAD in five steps: send a sketch or photo, get a fixed price within the hour, approve the first look, and download castable 3DM and STL files.",
  "/how-it-works",
);

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd data={pageJsonLd("/how-it-works", "How it works")} />
      <Hero
        eyebrow="How it works"
        title="From brief to castable file."
        sub="The clock starts once your order is paid and confirmed. Standard pieces get a first look within 6 hours, or it's free."
      >
        <Ctas secondary={{ href: "/pricing", label: "See prices" }} />
      </Hero>
      <Section title="Five steps">
        <NumberedList items={STEPS} />
      </Section>
      <Section eyebrow="With every design" title="What you get">
        <Ticks items={DELIVERABLES} className="max-w-2xl" />
      </Section>
      <FinalCta />
    </>
  );
}
