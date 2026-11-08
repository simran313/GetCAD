import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isOpenJob, jobState, type JobTimes } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadJobTimes, loadPodJobs, loadPodLoad, type PodDesignerLoad, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

import { assignDesignerAction } from "../../orders/actions";
import { RefreshEvery } from "../RefreshEvery";
import { JobActions } from "./JobActions";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/**
 * P5 — the team board (docs/design): who is working on what. Paid orders
 * waiting for a designer on the left, then each designer of the pod with
 * their open jobs and load (category minutes against the 480-minute shift,
 * DECISIONS §11). Assigning here is assign_designer(): the database checks
 * the pod, the agreement and capacity.
 */
export const dynamic = "force-dynamic";

export default async function TeamBoardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");

  let jobs: PodJob[];
  let designers: PodDesignerLoad[];
  let times: Map<string, JobTimes>;
  try {
    [jobs, designers, times] = await Promise.all([loadPodJobs(supabase), loadPodLoad(supabase), loadJobTimes(supabase)]);
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load the team board" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }

  const unassigned = jobs.filter((j) => j.status === "PAYMENT_HELD");
  const open = jobs.filter((j) => j.designer_id && isOpenJob(j.status));
  const shift = designers[0]?.shift_minutes ?? 480;
  const minutes = (js: PodJob[]) => js.reduce((s, j) => s + (j.minutes ?? 0), 0);

  return (
    <Page>
      <RefreshEvery seconds={30} />
      <PageHeader
        eyebrow={`${[...new Set(designers.map((d) => d.pod_name))].join(", ") || "Your pod"} · who is working on what`}
        title="Team board"
        description={`Shift 9:30 AM–6:30 PM IST · ${shift} minutes per designer. Going over warns; capacity blocking is off.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/pod/performance" className={buttonVariants({ variant: "secondary" })}>
              Performance
            </Link>
            <Link href="/admin/new-order" className={buttonVariants({ variant: "secondary" })}>
              Create order
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Column title="Unassigned" jobs={unassigned.length} note={unassigned.length ? `${minutes(unassigned)} min waiting` : undefined}>
          {unassigned.length === 0 && <Empty>Nothing waiting.</Empty>}
          {unassigned.map((j) => {
            const choices = designers.filter((d) => d.pod_id === j.pod_id);
            return (
              <JobCard key={j.order_id} job={j}>
                {j.category ? (
                  choices.length > 0 ? (
                    <form action={assignDesignerAction} className="flex gap-2">
                      <input type="hidden" name="order_id" value={j.order_id} />
                      <Select name="designer_id" required aria-label={`Assign ${j.order_ref ?? "job"} to`} className="min-w-0 flex-1" defaultValue="">
                        <option value="" disabled>
                          Assign to…
                        </option>
                        {choices.map((d) => (
                          <option key={d.designer_id} value={d.designer_id} disabled={!d.assignable}>
                            {d.name ?? d.designer_ref} · {d.open_minutes}/{d.shift_minutes}
                            {d.assignable ? "" : " · not signed"}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" size="sm">
                        Assign
                      </Button>
                    </form>
                  ) : (
                    <p className="text-[length:var(--fs-2)] text-muted-foreground">No designers in this pod.</p>
                  )
                ) : (
                  <Link href={`/orders/${j.order_id}`} className="text-[length:var(--fs-2)] underline underline-offset-4">
                    Set a category first
                  </Link>
                )}
              </JobCard>
            );
          })}
        </Column>

        {designers.map((d) => {
          const mine = open.filter((j) => j.designer_id === d.designer_id);
          return (
            <Column
              key={d.designer_id}
              title={d.name ?? d.designer_ref ?? "Designer"}
              sub={d.designer_ref}
              jobs={mine.length}
              load={{ open: d.open_minutes, shift: d.shift_minutes }}
            >
              {mine.length === 0 && <Empty>Free for new work.</Empty>}
              {mine.map((j) => {
                const paused = j.status === "IN_PROGRESS" && !!times.get(j.order_id)?.paused_at;
                const movable = ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(j.status);
                return (
                  <JobCard key={j.order_id} job={j}>
                    <div className="flex flex-wrap items-center gap-2">
                      {paused ? <StatusTag kind="needs">Paused</StatusTag> : <StatusTag kind={jobState(j.status).kind}>{jobState(j.status).word}</StatusTag>}
                      {j.designer_due_at && j.status !== "QC_REVIEW" && <Timer dueAt={j.designer_due_at} />}
                      {j.status === "QC_REVIEW" && j.sla_due_at && <Timer dueAt={j.sla_due_at} />}
                    </div>
                    {movable && (
                      <JobActions
                        orderId={j.order_id}
                        label={j.order_ref ?? "job"}
                        status={j.status}
                        designers={designers
                          .filter((o) => o.pod_id === j.pod_id && o.designer_id !== d.designer_id)
                          .map((o) => ({ id: o.designer_id, name: o.name ?? o.designer_ref ?? "Designer", load: `${o.open_minutes}/${o.shift_minutes}`, assignable: o.assignable }))}
                      />
                    )}
                  </JobCard>
                );
              })}
            </Column>
          );
        })}
      </div>
      {designers.length === 0 && (
        <p className="text-[length:var(--fs-2)] text-muted-foreground">No designers in your pod yet. An admin adds them from Access.</p>
      )}
    </Page>
  );
}

/**
 * One column of the board (owner, 8 Nov 2026: no overlaps at any width). The
 * name has the full line; under it the designer's number, then their load as
 * a bar with words ("Free", "270 of 480 min"), so nothing shares a line with
 * a name that may wrap.
 */
function Column({
  title,
  sub,
  jobs,
  load,
  note,
  children,
}: {
  title: string;
  sub?: string | null;
  jobs: number;
  load?: { open: number; shift: number };
  note?: string;
  children: React.ReactNode;
}) {
  const over = !!load && load.open > load.shift;
  const pct = load ? Math.min(100, Math.round((load.open / Math.max(1, load.shift)) * 100)) : 0;
  return (
    <Card as="section" className="flex flex-col bg-subtle">
      <div className="space-y-1.5 border-b border-border px-[var(--s-4)] py-[var(--s-3)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{title}</h2>
          <span className="tabular shrink-0 rounded-[var(--r-full)] border border-border bg-card px-2 py-0.5 text-[length:var(--fs-1)] font-medium">
            {jobs} job{jobs === 1 ? "" : "s"}
          </span>
        </div>
        {sub && <p className="font-mono text-[length:var(--fs-1)] text-muted-foreground">{sub}</p>}
        {load && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-[var(--r-full)] bg-border" aria-hidden>
              <div className={over ? "h-full bg-[color:var(--tone-danger-fg)]" : "h-full bg-foreground"} style={{ width: `${pct}%` }} />
            </div>
            <p className={`tabular text-[length:var(--fs-1)] ${over ? "font-semibold text-[color:var(--tone-danger-fg)]" : "text-muted-foreground"}`}>
              {load.open === 0 ? `Free · 0 of ${load.shift} min` : `${load.open} of ${load.shift} min${over ? " · over the shift" : ""}`}
            </p>
          </div>
        )}
        {note && <p className="tabular text-[length:var(--fs-1)] text-muted-foreground">{note}</p>}
      </div>
      <div className="flex-1 p-[var(--s-3)]">
        <ul className="space-y-3">{children}</ul>
      </div>
    </Card>
  );
}

function JobCard({ job, children }: { job: PodJob; children: React.ReactNode }) {
  return (
    <li className="space-y-2 rounded-[var(--r-sm)] border border-border bg-card p-[var(--s-3)]">
      <Link href={job.status === "QC_REVIEW" ? `/qc/${job.order_id}` : `/orders/${job.order_id}`} className="block hover:underline">
        <span className="block text-[length:var(--fs-3)] font-medium">{job.title}</span>
      </Link>
      <span className="flex items-center gap-2">
        <CategoryBadge letter={job.category} />
        <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(job.minutes)}</span>
        <span className="tabular font-mono text-[length:var(--fs-1)] text-muted-foreground">{job.order_ref}</span>
      </span>
      {children}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="text-[length:var(--fs-2)] text-muted-foreground">{children}</li>;
}
