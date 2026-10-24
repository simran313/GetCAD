import type { Metadata } from "next";

import { Ctas, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Our guarantees",
  "First look in 6 hours or it's free. Castable files, guaranteed to spec — fixed free and the CAD fee refunded if a file breaks its own spec sheet.",
  "/guarantee",
);

/** DECISIONS §6–§7, in LANDING-COPY's words. */
export default function GuaranteePage() {
  return (
    <>
      <Hero eyebrow="Guarantees" title="Two promises, in writing.">
        <Ctas />
      </Hero>
      <Section title="First look in 6 hours, or it's free">
        <div className="max-w-3xl space-y-4 text-[length:var(--fs-4)] leading-[var(--lh-4)]">
          <p>
            Applies to standard pieces (our categories A–F, which cover most rings, pendants, bands and earrings). The clock
            starts when your order is paid and confirmed — we confirm as soon as the brief is complete.
          </p>
          <p>
            If your first look isn&apos;t shared within 6 hours, the full amount you paid comes back as credit, and we still
            finish your order. Complex pieces get a firm deadline with the price.
          </p>
        </div>
      </Section>
      <Section title="Castable files, guaranteed to spec">
        <div className="max-w-3xl space-y-6 text-[length:var(--fs-4)] leading-[var(--lh-4)]">
          <p>
            Every file ships with a signed spec sheet listing its measured minimums (wall, prong, stone seats, size, mesh) and
            the checks it passed. If your file breaks its own spec sheet, we fix it free within 6 hours and refund the CAD fee.
          </p>
          <div>
            <p className="font-medium">How a claim works</p>
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-[length:var(--fs-3)]">
              <li>Open &quot;Raise a problem&quot; on the order within 30 days.</li>
              <li>Send the file you used, photos and your casting details.</li>
              <li>We re-measure our archived file and share the numbers with you.</li>
            </ol>
          </div>
          <p className="text-[length:var(--fs-3)] text-muted-foreground">
            <span className="font-medium text-foreground">What&apos;s not covered:</span> casting issues where the file meets
            spec, files edited after delivery, specs you asked us to go below, and metal or stone costs. The most we refund is
            the CAD fee.
          </p>
        </div>
      </Section>
      <Section title="Your work stays yours">
        <p className="max-w-3xl text-[length:var(--fs-4)] leading-[var(--lh-4)]">
          White-label. NDA by default. You own the files once paid. Our designers never see your customer.
        </p>
      </Section>
      <FinalCta />
    </>
  );
}
