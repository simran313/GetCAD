import type { Metadata } from "next";

import { INCLUDED } from "@/components/marketing/content";
import { Ctas, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { SimplePricing } from "@/components/marketing/home/more-sections";
import { SupportStatus } from "@/components/support/support-status";
import { WhatsAppButton } from "@/components/support/whatsapp";
import { c } from "@/content/claims";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Pricing",
  "From $35 a design, with a fixed price before you pay. Retainers for jewelers with regular orders.",
  "/pricing",
);

/**
 * One price and retainers (owner, 31 Oct 2026): the categories and bands in
 * DECISIONS §4 stay internal; every client gets a fixed price on their own
 * piece before paying. Retainers are arranged by talking to us.
 */
export default function PricingPage() {
  return (
    <>
      <Hero eyebrow="Pricing" title={`From ${c("ENTRY_PRICE")} a design.`} sub="You get a fixed price for your piece within the hour and only pay when you accept it.">
        <Ctas />
      </Hero>
      <Section>
        <SimplePricing entry={c("ENTRY_PRICE")} included={INCLUDED} />
      </Section>
      <Section eyebrow="For regular orders" title="Ask about a retainer.">
        <p className="max-w-2xl text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">
          Ordering every week? A retainer gives you a monthly rate, a named account manager and priority in the queue, bulk orders
          included. Tell us your volume and we will send a proposal.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <WhatsAppButton label="WhatsApp us about a retainer" text="Hi, I'd like to discuss a retainer for regular CAD orders." />
          <SupportStatus />
        </div>
      </Section>
      <FinalCta />
    </>
  );
}
