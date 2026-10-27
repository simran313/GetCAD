import { formatDate } from "@/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FinalCta, Hero, Section } from "@/components/marketing/blocks";
import { pageMetadata } from "@/lib/seo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const metadata: Metadata = pageMetadata(
  "Our numbers, last 30 days",
  "First looks on time, designs approved first time, late-order credits and upheld spec claims. Computed weekly, never edited by hand.",
  "/results",
);

// Add. A7. Nothing renders while the public_stats flag is off: the database
// returns no row, and the page is a 404 (DECISIONS §12).
export const dynamic = "force-dynamic";

interface Stats {
  computed_at: string;
  designs_delivered: number;
  first_look_on_time_pct: number | null;
  first_pass_approval_pct: number | null;
  late_credits_issued: number;
  claims_upheld: number;
}

export default async function ResultsPage() {
  const { data } = await createAdminSupabaseClient().rpc("public_stats_latest").maybeSingle();
  const s = data as Stats | null;
  if (!s) notFound();

  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const items: [string, string, string][] = [
    [pct(s.first_look_on_time_pct), "First looks on time", "Standard pieces seen within 6 hours of confirmation."],
    [pct(s.first_pass_approval_pct), "Approved first time", "Approved designs that needed no revision round."],
    [String(s.late_credits_issued), "Late-order credits", "Each late first look is credited, and counted here."],
    [String(s.claims_upheld), "Spec claims upheld", "Files that broke their certificate, fixed free."],
  ];

  return (
    <>
      <Hero
        eyebrow="Results · last 30 days"
        title="Our numbers, as they are."
        sub={`Computed by the system every week from ${s.designs_delivered} delivered design${s.designs_delivered === 1 ? "" : "s"}. Nobody edits them.`}
      />
      <Section>
        <dl className="grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-2">
          {items.map(([value, label, note]) => (
            <div key={label} className="bg-card p-[var(--s-6)]">
              <dd className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{value}</dd>
              <dt className="mt-2 text-[length:var(--fs-3)] font-medium">{label}</dt>
              <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">{note}</p>
            </div>
          ))}
        </dl>
        <p className="mt-4 font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
          Updated {formatDate(s.computed_at, "UTC")}
        </p>
      </Section>
      <FinalCta />
    </>
  );
}
