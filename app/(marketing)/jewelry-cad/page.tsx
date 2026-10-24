import type { Metadata } from "next";

import { PRODUCTS } from "@/components/marketing/content";
import { Eyebrow, FinalCta, Section } from "@/components/marketing/blocks";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { pageMetadata } from "@/lib/seo";

import { startBriefLeadAction } from "./actions";

export const metadata: Metadata = pageMetadata(
  "Jewelry CAD, first look in 6 hours — or it's free",
  "Castable 3DM and STL files, checked by a second designer, from $55. Your first design is $49.",
  "/jewelry-cad",
);

const BLOCKS: [string, string][] = [
  ["Fast", "Our team works US hours. Standard pieces get a first look within 6 hours of order confirmation."],
  ["Checked", "19 checks on every file — dimensions, stone seats, walls, prongs, open edges, mesh — by the designer, then by a second designer."],
  ["Fair", "$55 standard, $85 complex. No retainers, no setup fees."],
];

/** The ads landing page (LANDING-COPY "/jewelry-cad"). */
export default function JewelryCadPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="container grid max-w-5xl gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_380px]">
          <div>
            <Eyebrow>Jewelry CAD for the trade</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,5.5vw,4rem)] font-normal leading-[1.03] tracking-[-0.02em]">
              Jewelry CAD, first look in 6 hours — or it&apos;s free.
            </h1>
            <p className="mt-6 max-w-xl text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">
              Castable 3DM and STL files, checked by a second designer, from $55. Your first design is $49.
            </p>
            <p className="mt-6 max-w-xl text-[length:var(--fs-3)]">
              <span className="font-medium">Already have a CAD designer?</span> Use us for overflow and rush weeks. Same specs,
              your naming.
            </p>
          </div>
          <form
            action={startBriefLeadAction}
            className="space-y-4 self-start rounded-[var(--r-lg)] border border-border bg-card p-[var(--s-6)] shadow-[var(--e-1)]"
          >
            <Field label="What are we making?" htmlFor="product">
              <Select id="product" name="product" required defaultValue="">
                <option value="" disabled>
                  Choose a piece
                </option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Anything we should know?" htmlFor="note" optional hint="You add your sketch or photo on the next screen.">
              <Input id="note" name="note" maxLength={300} />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              Get my price
            </Button>
            <p className="text-center text-[length:var(--fs-2)] text-muted-foreground">
              Price within the hour. You only pay when you accept it.
            </p>
          </form>
        </div>
      </section>
      <Section>
        <div className="grid gap-8 md:grid-cols-3">
          {BLOCKS.map(([t, b]) => (
            <div key={t}>
              <p className="text-[length:var(--fs-4)] font-medium">{t}</p>
              <p className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </Section>
      <FinalCta />
    </>
  );
}
