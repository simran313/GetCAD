import type { Metadata } from "next";
import Link from "next/link";

import { INCLUDED, PRICE_BANDS, VOLUME } from "@/components/marketing/content";
import { Ctas, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Pricing",
  "$55 standard, $85 complex, sculpted from $120. Your first design is $49. No retainers, no setup fees.",
  "/pricing",
);

/** Prices from DECISIONS §4; plans are sold by talking to us (§12: plans checkout off). */
export default function PricingPage() {
  return (
    <>
      <Hero eyebrow="Pricing" title="Fixed bands. No retainer." sub="You get a price within the hour and only pay when you accept it.">
        <Ctas />
      </Hero>
      <Section title="Per design">
        <div className="overflow-hidden rounded-[var(--r-lg)] border border-border">
          <table className="w-full text-left">
            <tbody>
              {PRICE_BANDS.map((b) => (
                <tr key={b.band} className="border-b border-border last:border-b-0">
                  <th scope="row" className="w-40 px-[var(--s-5)] py-[var(--s-4)] text-[length:var(--fs-3)] font-medium">
                    {b.band}
                  </th>
                  <td className="tabular w-36 px-[var(--s-5)] py-[var(--s-4)] font-display text-[length:var(--fs-display)] leading-none">
                    {b.price}
                  </td>
                  <td className="px-[var(--s-5)] py-[var(--s-4)] text-[length:var(--fs-3)] text-muted-foreground">{b.examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-[length:var(--fs-3)]">
          <span className="font-medium">Included:</span> {INCLUDED}.
        </p>
      </Section>
      <Section eyebrow="For regular volume" title="Talk to us.">
        <div className="grid gap-6 md:grid-cols-3">
          {VOLUME.map(([t, b]) => (
            <div key={t} className="rounded-[var(--r-lg)] border border-border bg-card p-[var(--s-5)] shadow-[var(--e-1)]">
              <p className="text-[length:var(--fs-4)] font-medium">{t}</p>
              <p className="mt-2 text-[length:var(--fs-3)] text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
        <Link href="/contact" className="mt-6 inline-block text-[length:var(--fs-3)] underline underline-offset-4">
          Ask about volume pricing
        </Link>
      </Section>
      <FinalCta />
    </>
  );
}
