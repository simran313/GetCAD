import type { Metadata } from "next";

import { CHECK_GROUPS } from "@/components/marketing/content";
import { Ctas, FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Quality: checked twice before you see it",
  "Every design passes a 19-point checklist: once by the designer, then again by a second designer who didn't make it.",
  "/quality",
);

/** The 19 checks in 7 groups (build spec §8; DECISIONS §10). */
export default function QualityPage() {
  let n = 0;
  return (
    <>
      <Hero
        eyebrow="Quality"
        title="Checked twice before you see it."
        sub="Every design passes a 19-point checklist: once by the designer, then again by a second designer who didn't make it. You get the signed checklist with your files."
      >
        <Ctas />
      </Hero>
      <Section title="The 19 checks">
        <div className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border md:grid-cols-2">
          {CHECK_GROUPS.map((g) => (
            <div key={g.group} className="bg-card p-[var(--s-5)]">
              <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">{g.group}</p>
              <ol className="mt-3 space-y-2">
                {g.checks.map((c) => {
                  n += 1;
                  return (
                    <li key={c} className="grid grid-cols-[2rem_1fr] text-[length:var(--fs-3)] leading-[var(--lh-3)]">
                      <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">{String(n).padStart(2, "0")}</span>
                      {c}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </Section>
      <FinalCta />
    </>
  );
}
