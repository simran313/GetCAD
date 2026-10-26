import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { jobClockDue, jobState, minutesWord } from "@/core";
import { Card, CardBody } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { Checklist } from "@/components/work/checklist";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { jobTitle, loadMyWork } from "@/lib/work/load";

import type { ChecklistRow } from "../../../orders/WorkPanels";
import { Page } from "@/components/ui/page";

/**
 * D4b — the designer's checklist (docs/design). Ticks while the job is in
 * progress; the sign-off line is the 19th. The QC column fills in after
 * submission, by the pod lead.
 */
export const dynamic = "force-dynamic";

export default async function JobChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();

  const [job] = await loadMyWork(supabase, id).catch(() => []);
  if (!job) redirect("/work");
  const { data } = await supabase.rpc("job_checklist", { p_order_id: id });
  const rows = (data ?? []) as ChecklistRow[];
  const ticked = rows.filter((r) => r.designer_at).length;
  const clock = jobClockDue(job.started_at, job.minutes);
  const working = job.status === "IN_PROGRESS";
  const { data: profile } = await supabase.from("designer_profiles").select("designer_ref").maybeSingle();

  return (
    <Page>
      <Link href={`/work/${id}`} className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Back to the job
      </Link>
      <PageHeader eyebrow={`Checklist · ${job.job_code ?? ""} · version ${job.work_version} · internal use only`} title={jobTitle(job)} />
      <div className="flex flex-wrap items-center gap-3">
        <CategoryBadge letter={job.category} />
        <span className="font-mono text-[length:var(--fs-1)]">{minutesWord(job.minutes)}</span>
        <StatusTag kind={jobState(job.status).kind}>{jobState(job.status).word}</StatusTag>
        {clock && working && <Timer dueAt={clock} label="Your time left" />}
        <span className="tabular ml-auto font-mono text-[length:var(--fs-2)]">Ticked {ticked} / 19</span>
      </div>
      {!working && (
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          {job.status === "ASSIGNED" || job.status === "REVISION_REQUESTED"
            ? "Press Start work on the job to tick."
            : "Submitted. The QC column is your pod lead's."}
        </p>
      )}
      <Card>
        <CardBody>
          <Checklist
            orderId={id}
            rows={rows}
            canTickDesigner={working}
            canTickQc={false}
            signoffLabel={`Designer sign-off · ${(profile as { designer_ref?: string } | null)?.designer_ref ?? "you"} · when all 18 are ticked`}
          />
        </CardBody>
      </Card>
    </Page>
  );
}
