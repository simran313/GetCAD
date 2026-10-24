import { Eyebrow } from "@/components/marketing/blocks";

/**
 * Terms and Privacy (owner answer Q14): drafted from docs/DECISIONS.md for a
 * lawyer to review, and marked as a draft on the page until replaced.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <section className="container max-w-3xl py-16">
      <Eyebrow>Draft · pending legal review · {updated}</Eyebrow>
      <h1 className="mt-3 font-display text-[clamp(2.25rem,5vw,3.25rem)] font-normal leading-[1.05]">{title}</h1>
      <p className="mt-4 text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">{intro}</p>
      <div className="mt-6 rounded-[var(--r-md)] border border-border bg-subtle p-[var(--s-4)] text-[length:var(--fs-2)] leading-[var(--lh-2)]">
        This is a working draft written in plain language from how The CAD Pillar actually operates. It has not yet been
        reviewed by a lawyer and will be replaced by a reviewed version. If anything here matters to a decision you are making,
        ask us first.
      </div>
      <ol className="mt-10 space-y-8">
        {sections.map((s, i) => (
          <li key={s.heading}>
            <h2 className="text-[length:var(--fs-4)] font-medium">
              {i + 1}. {s.heading}
            </h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
                {p}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
