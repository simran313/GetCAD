import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isOpenJob, jobState, loadWord } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, loadPodLoad, type PodDesignerLoad, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

import { assignDesignerAction } from "../../orders/actions";
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
  try {
    [jobs, designers] = await Promise.all([loadPodJobs(supabase), loadPodLoad(supabase)]);
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
      <PageHeader
        eyebrow={`${[...new Set(designers.map((d) => d.pod_name))].join(", ") || "Your pod"} · who is working on what`}
        title="Team board"
        description={`Shift 9:30 AM–6:30 PM IST · ${shift} minutes per designer. Going over warns; capacity blocking is off.`}
        actions={
          <Link href="/admin/new-order" className={buttonVariants({ variant: "secondary" })}>
            Create order
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Column title="Unassigned" meta={`${unassigned.length} job${unassigned.length === 1 ? "" : "s"} · ${minutes(unassigned)} min`}>
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
              meta={`${mine.length} job${mine.length === 1 ? "" : "s"} · ${loadWord(d.open_minutes, d.shift_minutes)}`}
              over={d.open_minutes > d.shift_minutes}
            >
              {mine.length === 0 && <Empty>Free for new work.</Empty>}
              {mine.map((j) => (
                <JobCard key={j.order_id} job={j}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag kind={jobState(j.status).kind}>{jobState(j.status).word}</StatusTag>
                    {j.designer_due_at && j.status !== "QC_REVIEW" && <Timer dueAt={j.designer_due_at} />}
                    {j.status === "QC_REVIEW" && j.sla_due_at && <Timer dueAt={j.sla_due_at} />}
                  </div>
                </JobCard>
              ))}
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

function Column({
  title,
  sub,
  meta,
  over,
  children,
}: {
  title: string;
  sub?: string | null;
  meta: string;
  over?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className="bg-subtle">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {sub && <p className="font-mono text-[length:var(--fs-2)] text-muted-foreground">{sub}</p>}
        </div>
        <span className={`tabular font-mono text-[length:var(--fs-2)] ${over ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {meta}
        </span>
      </CardHeader>
      <CardBody>
        <ul className="space-y-3">{children}</ul>
      </CardBody>
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
