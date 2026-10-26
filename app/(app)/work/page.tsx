import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { jobClockDue, jobState, jobTab, minutesWord, rupeesWord, type JobTab } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { cn } from "@/lib/utils";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { jobTitle, loadMyWork, type Job } from "@/lib/work/load";

import { StartWorkButton } from "./StartWorkButton";

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
  await supabase.rpc("ensure_self");
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  if (me?.role !== "DESIGNER") redirect("/orders");

  let jobs: Job[];
  try {
    jobs = await loadMyWork(supabase);
  } catch (e) {
    return (
      <main className="container max-w-5xl py-8">
        <ErrorPanel title="Couldn't load your jobs" message={`${(e as Error).message} — reload the page to try again.`} />
      </main>
    );
  }
  const count = (t: JobTab) => jobs.filter((j) => jobTab(j.status) === t).length;
  const shown = jobs.filter((j) => jobTab(j.status) === active);

  return (
    <main className="container max-w-5xl space-y-6 py-8">
      <PageHeader eyebrow="Assigned to you by your pod lead" title="Open jobs" />

      <nav aria-label="Jobs" className="border-b border-border">
        <ul className="flex gap-6 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={key === "open" ? "/work" : `/work?tab=${key}`}
                aria-current={active === key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[var(--ctl-sm)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-2)]",
                  active === key ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label} <span className="tabular font-mono text-[length:var(--fs-1)]">{count(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">
          {active === "open" ? "No open jobs. You'll get a notification when your pod lead assigns one." : "Nothing here yet."}
        </Card>
      ) : (
        <>
          {/* Phone: rows. */}
          <Card className="md:hidden">
            {shown.map((j) => {
              const clock = jobClockDue(j.started_at, j.minutes);
              return (
                <ListRow
                  key={j.order_id}
                  href={`/work/${j.order_id}`}
                  reference={`${j.job_code ?? ""} · CAT ${j.category ?? "–"} · ${minutesWord(j.minutes)}`}
                  title={jobTitle(j)}
                  meta={jobState(j.status).word}
                  trailing={clock && active === "open" ? <Timer dueAt={clock} /> : <StatusTag kind={jobState(j.status).kind}>{jobState(j.status).word}</StatusTag>}
                />
              );
            })}
          </Card>

          {/* Desk: the table. */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border text-[length:var(--fs-2)] text-muted-foreground">
                <tr>
                  {["Job", "Category", "Pay", "Your time", "Due to QC", "Status", ""].map((h) => (
                    <th key={h} className="px-[var(--s-4)] py-[var(--s-3)] font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => {
                  const clock = jobClockDue(j.started_at, j.minutes);
                  const state = jobState(j.status);
                  return (
                    <tr key={j.order_id} className="border-b border-border last:border-b-0">
                      <td className="px-[var(--s-4)] py-[var(--s-3)]">
                        <Link href={`/work/${j.order_id}`} className="block text-[length:var(--fs-3)] font-medium hover:underline">
                          {jobTitle(j)}
                        </Link>
                        <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
                          {j.job_code}
                        </span>
                      </td>
                      <td className="px-[var(--s-4)] py-[var(--s-3)]">
                        <span className="flex items-center gap-2">
                          <CategoryBadge letter={j.category} />
                          <span className="font-mono text-[length:var(--fs-1)]">{minutesWord(j.minutes)}</span>
                        </span>
                      </td>
                      <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">{j.pay_paise ? rupeesWord(j.pay_paise) : "—"}</td>
                      <td className="px-[var(--s-4)] py-[var(--s-3)]">
                        {clock && active === "open" ? <Timer dueAt={clock} /> : <span className="text-muted-foreground">{minutesWord(j.minutes)}</span>}
                      </td>
                      <td className="px-[var(--s-4)] py-[var(--s-3)]">
                        {j.designer_due_at && active !== "done" ? <Timer dueAt={j.designer_due_at} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-[var(--s-4)] py-[var(--s-3)]">
                        <StatusTag kind={state.kind}>{state.word}</StatusTag>
                      </td>
                      <td className="px-[var(--s-4)] py-[var(--s-3)] text-right">
                        {j.status === "ASSIGNED" ? (
                          <StartWorkButton orderId={j.order_id} />
                        ) : (
                          <Link href={`/work/${j.order_id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        You only see jobs your pod lead has assigned to you. Your timer starts when you press Start work and follows the job&apos;s
        category.
      </p>
    </main>
  );
}
