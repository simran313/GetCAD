import type { Metadata } from "next";

import { AUDIENCES, DELIVERABLES, GUARANTEES, PROOF, STEPS } from "@/components/marketing/content";
import { Ctas, FinalCta, Hero, NumberedList, Section, Ticks } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Your CAD department, without the hire",
  "Production-ready jewelry CAD for US jewelers, manufacturers and brands. First look within 6 hours of order confirmation, or it's free. Castable files, guaranteed to spec.",
  "/",
);

/** Home (docs/marketing/LANDING-COPY.md). */
export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="Jewelry CAD for the trade"
        title="Your CAD department, without the hire."
        sub="Production-ready jewelry CAD for US jewelers, manufacturers and brands. First look within 6 hours of order confirmation, or it's free. Castable files, guaranteed to spec."
      >
        <Ctas secondary={{ href: "/how-it-works", label: "See how it works" }} />
      </Hero>

      <section className="border-b border-border bg-subtle">
        <ul className="container grid max-w-5xl gap-4 py-6 sm:grid-cols-3">
          {PROOF.map((p) => (
            <li key={p} className="font-mono text-[length:var(--fs-2)] uppercase tracking-[0.06em]">
              {p}
            </li>
          ))}
        </ul>
      </section>

      <Section eyebrow="How it works" title="Five steps, the first one takes two minutes.">
        <NumberedList items={STEPS} />
      </Section>

      <Section eyebrow="With every design" title="What you get">
        <Ticks items={DELIVERABLES} className="max-w-2xl" />
      </Section>

      <Section eyebrow="The guarantees" title="Promises we put money behind.">
        <div className="grid gap-8 md:grid-cols-3">
          {GUARANTEES.map(([t, b]) => (
            <div key={t}>
              <p className="text-[length:var(--fs-4)] font-medium">{t}</p>
              <p className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Who we work with" title="Built for the trade.">
        <Ticks items={AUDIENCES} className="max-w-2xl" />
      </Section>

      <FinalCta />
    </>
  );
}
