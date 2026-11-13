import type { Metadata } from "next";
import Link from "next/link";

import { PRODUCTS } from "@/components/marketing/content";
import { Eyebrow, FinalCta, Section } from "@/components/marketing/blocks";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { JsonLd } from "@/components/seo/json-ld";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

import { startBriefLeadAction } from "./actions";

export const metadata: Metadata = pageMetadata(
  "Custom Jewelry CAD Design Services | The CAD Pillar",
  "Custom jewelry CAD design for brands, retailers and manufacturers: castable 3DM and STL files from your sketch or photo, a first look in 6 hours, from $35.",
  "/jewelry-cad",
  { absolute: true },
);

/**
 * What the service covers, for the buyers who search for it (SEO, 12 Nov
 * 2026). Every line is something the website already promises
 * (content/claims.ts, docs/DECISIONS.md §4, §7, §9).
 */
const SERVICES: [string, string][] = [
  [
    "Custom jewelry CAD from sketches and photos",
    "Send a sketch, photo or reference with the size, metal and stones. You get a fixed price within the hour, and a first look within 6 hours of confirmation for standard pieces.",
  ],
  [
    "Manufacturing-ready 3DM and STL files",
    "A Rhino 3DM and a print-ready STL for casting or 3D printing, with a signed spec sheet (walls, prongs, stone seats, size) and a weight sheet in 10K, 14K, 18K, platinum and silver.",
  ],
  [
    "Jewelry rendering",
    "Render views of every design to approve, and photo-real renders as an order of their own, quoted on request.",
  ],
  [
    "White-label CAD outsourcing",
    "Your naming, NDA by default, and you own the files once paid. Use us for overflow, rush weeks or every order, with a retainer for regular volume.",
  ],
];

const BLOCKS: [string, string][] = [
  ["Fast", "Our AI models every piece, so a first look comes within 6 hours of order confirmation, bulk orders included."],
  ["Checked", "Two-stage QC on every file — the designer's check, then the QC manager's: measurements, diamonds, setting, metal, open edges, mesh. 99% of first looks are right first time."],
  ["Fair", "From $35 a design. Retainers for regular orders. No setup fees."],
];

/** The ads landing page (LANDING-COPY "/jewelry-cad"). */
export default function JewelryCadPage() {
  return (
    <>
      <JsonLd data={pageJsonLd("/jewelry-cad", "Jewelry CAD services", { service: true })} />
      <section className="border-b border-border">
        <div className="container grid max-w-5xl gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_380px]">
          <div>
            <Eyebrow>Jewelry CAD for the trade</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,5.5vw,4rem)] font-normal leading-[1.03] tracking-[-0.02em]">
              Jewelry CAD, first look in 6 hours — or it&apos;s free.
            </h1>
            <p className="mt-6 max-w-xl text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">
              AI-native jewelry CAD: castable 3DM and STL files, checked by senior designers, from $35 a design.
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
      <Section eyebrow="For jewelry brands, retailers and manufacturers" title="Jewelry CAD services, from sketch to castable file.">
        <div className="grid gap-8 md:grid-cols-2">
          {SERVICES.map(([t, b]) => (
            <div key={t}>
              <h3 className="text-[length:var(--fs-4)] font-medium">{t}</h3>
              <p className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-3xl text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
          Working with us from the US? Prices are in US dollars, every design is briefed and approved in the portal, and
          live support hours are shown in US Eastern time. See{" "}
          <Link href="/how-it-works" className="text-foreground underline underline-offset-4">
            how jewelry CAD outsourcing works
          </Link>
          ,{" "}
          <Link href="/pricing" className="text-foreground underline underline-offset-4">
            jewelry CAD pricing
          </Link>
          ,{" "}
          <Link href="/quality" className="text-foreground underline underline-offset-4">
            how every file is checked
          </Link>{" "}
          and{" "}
          <Link href="/guarantee" className="text-foreground underline underline-offset-4">
            our guarantees
          </Link>
          .
        </p>
      </Section>
      <FinalCta />
    </>
  );
}
