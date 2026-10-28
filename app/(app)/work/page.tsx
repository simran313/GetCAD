import { auth } from "@clerk/nextjs/server";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { jobClockDue, jobState, jobTab, rupeesWord, type JobTab } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { StatusTag } from "@/components/ui/status-tag";
import { cn } from "@/lib/utils";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { jobTitle, loadMyWork, type Job } from "@/lib/work/load";

import { StartWorkButton } from "./StartWorkButton";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/**
 * D3 — Open jobs (docs/design). Only the jobs the pod lead assigned to this
 * designer, by job code. The designer's own timer is the category time from
 * Start work; the second clock is when the work must reach QC.
 */
export const dynamic = "force-dynamic";

const TABS: [JobTab, string][] = [
  ["open", "Open jobs"],
  ["qc", "Submitted to QC"],
  ["done", "Done"],
];

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { tab } = await searchParams;
  const active: JobTab = tab === "qc" || tab === "done" ? tab : "open";

  const supabase = await createUserSupabaseClient();
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  if (me?.role !== "DESIGNER") redirect("/orders");

  let jobs: Job[];
  try {
    jobs = await loadMyWork(supabase);
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load your jobs" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }
  const count = (t: JobTab) => jobs.filter((j) => jobTab(j.status) === t).length;
  const shown = jobs.filter((j) => jobTab(j.status) === active);
  // One black button: the first job waiting to be started.
  const firstToStart = shown.find((j) => j.status === "ASSIGNED")?.order_id;

  const columns: Column<Job>[] = [
    {
      key: "job",
      header: "Job",
      card: "title",
      cell: (j) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{jobTitle(j)}</span>
          <span className="tabular block font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">{j.job_code}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", card: "badge", className: "whitespace-nowrap", cell: (j) => <StatusTag kind={jobState(j.status).kind}>{jobState(j.status).word}</StatusTag> },
    {
      key: "cat",
      header: "Category",
      className: "whitespace-nowrap",
      cell: (j) => (
        <span className="inline-flex items-center gap-2">
          <CategoryBadge letter={j.category} />
          <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(j.minutes)}</span>
        </span>
      ),
    },
    { key: "pay", header: "Pay", className: "tabular whitespace-nowrap", cell: (j) => (j.pay_paise ? rupeesWord(j.pay_paise) : "—") },
    {
      key: "clock",
      header: "Your time",
      className: "whitespace-nowrap",
      cell: (j) => {
        const clock = jobClockDue(j.started_at, j.minutes);
        return clock && active === "open" ? (
          <SlaCountdown dueAt={clock} label="Your time" />
        ) : (
          <span className="text-[length:var(--fs-2)] text-muted-foreground">{j.status === "ASSIGNED" ? "Starts when you do" : "—"}</span>
        );
      },
    },
    {
      key: "due",
      header: "Due to QC",
      className: "whitespace-nowrap",
      cell: (j) =>
        j.designer_due_at && active !== "done" ? <SlaCountdown dueAt={j.designer_due_at} label="Due to QC" /> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "action",
      header: <span className="sr-only">Next move</span>,
      card: "action",
      align: "right",
      className: "w-[1%] whitespace-nowrap",
      cell: (j) =>
        j.status === "ASSIGNED" ? (
          <StartWorkButton orderId={j.order_id} variant={j.order_id === firstToStart ? "default" : "secondary"} />
        ) : (
          <Link href={`/work/${j.order_id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open job
          </Link>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader title="Open jobs" description="Only the jobs your pod lead has assigned to you. Your timer starts when you press Start work." />

      <nav aria-label="Jobs" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex min-w-max gap-6 border-b border-border">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={key === "open" ? "/work" : `/work?tab=${key}`}
                aria-current={active === key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[var(--ctl)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-3)]",
                  active === key ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className="tabular rounded-[var(--r-full)] bg-muted px-2 text-[length:var(--fs-1)] leading-5 text-muted-foreground">{count(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ResponsiveDataList
        caption="Your jobs"
        columns={columns}
        rows={shown}
        rowKey={(j) => j.order_id}
        prefetchOnTouch
        rowHref={(j) => `/work/${j.order_id}`}
        linkKey="job"
        empty={
          <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            <EmptyState
              icon={<CircleCheck />}
              title={active === "open" ? "No open jobs" : active === "qc" ? "Nothing with QC" : "Nothing finished yet"}
              description={active === "open" ? "Your pod lead assigns the next one. You get a notification when they do." : undefined}
            />
          </div>
        }
      />
    </Page>
  );
}
