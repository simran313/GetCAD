import Link from "next/link";

import { Ctas, Eyebrow, Faq, FinalCta, Section, Ticks } from "@/components/marketing/blocks";

import type { ServicePageContent } from "./service-pages";

/**
 * One layout for the service and guide pages (AI search, phase 2, 15 Nov
 * 2026). Answer first: the hero says what it is, the price and the speed in
 * two sentences; every section opens with a short direct answer, then the
 * detail. That is the shape search engines and AI assistants quote.
 */
export function ServicePage({ page }: { page: ServicePageContent }) {
  return (
    <>
      <section className="border-b border-border">
        <div className="container max-w-5xl py-16 sm:py-24">
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.5rem,6vw,4.25rem)] font-normal leading-[1.02] tracking-[-0.02em]">
            {page.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">{page.answer}</p>
          <div className="mt-8">
            <Ctas primary={page.cta} secondary={page.secondary} />
          </div>
        </div>
      </section>

      <Section eyebrow="At a glance">
        <dl className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-2">
          {page.facts.map(([label, value], i) => (
            // An odd last fact takes the full row, so no empty cell shows.
            <div
              key={label}
              className={`bg-card p-[var(--s-5)] ${i === page.facts.length - 1 && page.facts.length % 2 === 1 ? "sm:col-span-2" : ""}`}
            >
              <dt className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-[length:var(--fs-3)] leading-[var(--lh-3)]">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {page.sections.map((s) => (
        <Section key={s.title} title={s.title}>
          <p className="max-w-3xl text-[length:var(--fs-4)] leading-[var(--lh-4)]">{s.answer}</p>
          {s.points && <Ticks items={s.points} className="mt-6 max-w-3xl" />}
          {/* Focusable so the table scrolls with the keyboard on a phone (axe: scrollable-region-focusable). */}
          {s.table && (
            <div tabIndex={0} role="region" aria-label={s.title} className="mt-8 overflow-x-auto rounded-[var(--r-lg)] border border-border">
              <table className="w-full min-w-[560px] border-collapse text-left text-[length:var(--fs-2)] leading-[var(--lh-2)]">
                <thead className="bg-subtle">
                  <tr>
                    {s.table.head.map((h) => (
                      <th key={h} scope="col" className="border-b border-border px-4 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-border last:border-b-0">
                      {row.map((cell, i) =>
                        i === 0 ? (
                          <th key={i} scope="row" className="px-4 py-3 align-top font-medium">
                            {cell}
                          </th>
                        ) : (
                          <td key={i} className="px-4 py-3 align-top text-muted-foreground">
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ))}

      <Section eyebrow="Questions" title={page.faqTitle}>
        <Faq items={page.faq} />
      </Section>

      <Section eyebrow="Related">
        <ul className="flex flex-wrap gap-x-8 gap-y-3">
          {page.related.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-[length:var(--fs-3)] underline underline-offset-4">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <FinalCta line={page.closing} />
    </>
  );
}
