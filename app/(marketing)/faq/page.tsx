import type { Metadata } from "next";
import Link from "next/link";

import { FAQ } from "@/components/marketing/content";
import { Faq, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("FAQ", "Where we are, how fast it is, what you get and who owns it.", "/faq");

export default function FaqPage() {
  return (
    <>
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
