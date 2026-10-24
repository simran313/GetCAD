import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { rupeesWord } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Timer } from "@/components/ui/timer";
import { SectionLabel, Stats } from "@/components/work/stats";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { ago, loadEarnings, loadPodJobs, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

/**
 * P1 — the QC queue (docs/design). Work in the pod lead's pods that is
 * waiting for a check, oldest first, then the ones already being reviewed.
 * "Client sees it" is the first-look deadline the QC pass has to beat.
 */
export const dynamic = "force-dynamic";

export default async function QcQueuePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");

  let jobs: PodJob[];
  let earned = 0;
  try {
    const [all, earnings] = await Promise.all([loadPodJobs(supabase), loadEarnings(supabase)]);
    jobs = all;
    const month = new Date().toISOString().slice(0, 7);
    earned = earnings.filter((e) => e.party === "QC" && e.created_at.startsWith(month)).reduce((s, e) => s + e.amount_paise, 0);
  } catch (e) {
    return (
      <main className="container max-w-5xl py-8">
        <ErrorPanel title="Couldn't load the QC queue" message={`${(e as Error).message} — reload the page to try again.`} />
      </main>
    );
  }

  const inQc = jobs.filter((j) => j.status === "QC_REVIEW");
  const oldest = (a: PodJob, b: PodJob) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "");
  const waiting = inQc.filter((j) => j.qc_ticks === 0).sort(oldest);
  const reviewing = inQc.filter((j) => j.qc_ticks > 0).sort(oldest);
  const soonest = inQc
    .map((j) => j.sla_due_at)
    .filter((d): d is string => !!d)
    .sort()[0];
  const unassigned = jobs.filter((j) => j.status === "PAYMENT_HELD").length;

  return (
    <main className="container max-w-5xl space-y-8 py-8">
      <PageHeader
        eyebrow={`${[...new Set(jobs.map((j) => j.pod_name).filter(Boolean))].join(", ") || "Your pod"} · you see only what needs a check`}
        title="QC queue"
        actions={
          <Link href="/admin/new-order" className={buttonVariants({ variant: "outline" })}>
            Create order
          </Link>
        }
      />
      <Stats
        items={[
          [String(waiting.length), "waiting for QC"],
          [String(reviewing.length), "in your review"],
          [String(unassigned), "paid, not yet assigned"],
          [rupeesWord(earned), "QC earnings · month"],
        ]}
      />
      {soonest && (
        <p className="flex items-center gap-2 text-[length:var(--fs-2)]">
          Next client first look <Timer dueAt={soonest} />
        </p>
      )}

      <Queue title="Awaiting QC · oldest first" rows={waiting} action="Start review" empty="Nothing waiting for a check." />
      <Queue title="In your review" rows={reviewing} action="Continue" empty="No reviews in progress." />
    </main>
  );
}

function Queue({ title, rows, action, empty }: { title: string; rows: PodJob[]; action: string; empty: string }) {
  return (
    <section className="space-y-3">
      <SectionLabel>
        {title} · {rows.length}
      </SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <p className="p-[var(--s-6)] text-center text-[length:var(--fs-3)] text-muted-foreground">{empty}</p>
        ) : (
          rows.map((j) => (
            <ListRow
              key={j.order_id}
              href={`/qc/${j.order_id}`}
              reference={j.order_ref}
              title={j.title}
              meta={`${j.designer_ref ?? "Designer"} · v${j.work_version}${j.submitted_at ? ` · submitted ${ago(j.submitted_at)}` : ""}${
                j.qc_ticks > 0 ? ` · QC ${j.qc_ticks}/19` : ""
              }`}
              trailing={
                <>
                  {j.sla_due_at && <Timer dueAt={j.sla_due_at} label="Client sees it" />}
                  <span className={buttonVariants({ size: "sm" })}>{action}</span>
                </>
              }
            />
          ))
        )}
      </Card>
    </section>
  );
}
