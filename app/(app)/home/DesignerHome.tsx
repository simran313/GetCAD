import { CircleCheck } from "lucide-react";
import Link from "next/link";

import { jobClockDue, jobState, jobTab, rupeesWord, formatDay, formatRelative, formatTime } from "@/core";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { EmptyState } from "@/components/ui/empty-state";
import { SlaCountdown } from "@/components/ui/sla-countdown";
import { SectionLabel, Stats } from "@/components/work/stats";
import { jobTitle, type Earning, type Job } from "@/lib/work/load";
import type { VersionNote } from "@/lib/work/notes";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";

/**
 * D2 — the designer's home (docs/design). What needs them first: a job sent
 * back with its notes, a new job to start, one due soon; then messages and
 * the last payout. Nothing about any client, ever.
 */
export async function DesignerHome({
  designerRef,
  podName,
  onboarded,
  bankStatus,
  jobs,
  notes,
  earnings,
  unread,
  lastPayout,
}: {
  designerRef: string | null;
  podName: string | null;
  onboarded: boolean;
  bankStatus: string | null;
  jobs: Job[];
  notes: Record<string, VersionNote | null>;
  earnings: Earning[];
  unread: { order_id: string | null; created_at: string }[];
  lastPayout: { summary: string; created_at: string } | null;
}) {
  const tz = await viewerZone();
  const now = Date.now();
  const open = jobs.filter((j) => jobTab(j.status) === "open");
  const dueSoon = open.filter((j) => j.designer_due_at && Date.parse(j.designer_due_at) - now < 24 * 3600_000);
  const month = new Date().toISOString().slice(0, 7);
  const earned = earnings.filter((e) => e.created_at.startsWith(month)).reduce((s, e) => s + e.amount_paise, 0);
  const weekAgo = now - 7 * 24 * 3600_000;
  const submitted = jobs.filter((j) => j.submitted_at && Date.parse(j.submitted_at) > weekAgo).length;
  const byId = new Map(jobs.map((j) => [j.order_id, j]));

  const revisions = open.filter((j) => j.status === "REVISION_REQUESTED");
  const fresh = open.filter((j) => j.status === "ASSIGNED");
  const going = open.filter((j) => j.status === "IN_PROGRESS");
  // One black button on the screen: the job to open first.
  const firstId = (revisions[0] ?? fresh[0] ?? going[0])?.order_id;

  return (
    <Page>
      <PageHeader
        eyebrow={[designerRef ? `Designer ${designerRef}` : "Designer", podName].filter(Boolean).join(" · ")}
        title="Home"
      />

      {!onboarded && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[length:var(--fs-4)] font-medium">Finish onboarding</p>
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                Sign the designer agreement. Your pod lead can assign you work once it is signed.
              </p>
            </div>
            <Link href="/onboarding/designer" className={buttonVariants({ size: "sm" })}>
              Continue
            </Link>
          </CardBody>
        </Card>
      )}

      <Stats
        items={[
          [String(open.length), "jobs active"],
          [String(dueSoon.length), "due in 24 h"],
          [rupeesWord(earned), "earned this month"],
          [String(submitted), "sent to QC this week"],
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="needs-title" className="space-y-3">
          <SectionLabel id="needs-title">Needs you</SectionLabel>
          {revisions.length + fresh.length + going.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CircleCheck />}
                title="No open jobs"
                description="Your pod lead assigns the next one. You get a notification when they do."
                className="py-8"
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {revisions.map((j) => {
                const note = notes[j.order_id];
                return (
                  <li key={j.order_id}>
                    <Card>
                      <CardBody className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusTag kind="needs">Changes requested</StatusTag>
                          {j.designer_due_at && <SlaCountdown dueAt={j.designer_due_at} label="Due" />}
                        </div>
                        <p className="text-[length:var(--fs-4)] font-medium">
                          {jobTitle(j)} <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">{j.job_code}</span>
                        </p>
                        {note && (
                          <ol className="list-decimal space-y-1 pl-5 text-[length:var(--fs-3)]">
                            {note.lines.map((l, i) => (
                              <li key={i}>{l}</li>
                            ))}
                          </ol>
                        )}
                        <Link href={`/work/${j.order_id}`} className={buttonVariants({ variant: j.order_id === firstId ? "default" : "secondary", className: "w-full sm:w-auto" })}>
                          Open job
                        </Link>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
              {[...fresh, ...going].map((j) => {
                const clock = jobClockDue(j.started_at, j.minutes);
                return (
                  <li key={j.order_id}>
                    <Card>
                      <CardBody className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <StatusTag kind={jobState(j.status).kind}>{j.status === "ASSIGNED" ? "New job" : "In progress"}</StatusTag>
                            <CategoryBadge letter={j.category} />
                          </div>
                          <p className="mt-1 text-[length:var(--fs-4)] font-medium">{jobTitle(j)}</p>
                          <p className="text-[length:var(--fs-2)] text-muted-foreground">
                            {j.job_code}
                            {j.designer_due_at ? ` · due ${`${formatDay(j.designer_due_at, tz)} ${formatTime(j.designer_due_at, tz)}`}` : ""}
                          </p>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                          {clock && <SlaCountdown dueAt={clock} label="Your time" />}
                          <Link href={`/work/${j.order_id}`} className={buttonVariants({ variant: j.order_id === firstId ? "default" : "secondary", className: "w-full sm:w-auto" })}>
                            Open job
                          </Link>
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <SectionLabel>Messages</SectionLabel>
          <Card>
            {unread.length === 0 ? (
              <CardBody className="text-[length:var(--fs-2)] text-muted-foreground">No unread messages.</CardBody>
            ) : (
              <ul>
                {unread.slice(0, 4).map((m, i) => {
                  const j = m.order_id ? byId.get(m.order_id) : undefined;
                  return (
                    <li key={i} className="border-b border-border last:border-b-0">
                      <Link
                        href={m.order_id ? `/messages/${m.order_id}` : "/messages"}
                        className="flex items-center justify-between gap-3 px-[var(--s-4)] py-[var(--s-3)] hover:bg-subtle"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[length:var(--fs-3)] font-medium">
                            Pod lead{j ? ` · ${jobTitle(j)}` : ""}
                          </span>
                          <span className="block text-[length:var(--fs-2)] text-muted-foreground">{formatRelative(m.created_at, tz)}</span>
                        </span>
                        <span className="text-[length:var(--fs-2)] underline underline-offset-4">Open</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {lastPayout && (
            <Card>
              <CardBody>
                <p className="text-[length:var(--fs-3)] font-medium">Payout sent</p>
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  {lastPayout.summary} · {formatRelative(lastPayout.created_at, tz)}
                </p>
                <Link href="/work/earnings" className="mt-2 inline-block text-[length:var(--fs-2)] underline underline-offset-4">
                  View earnings
                </Link>
              </CardBody>
            </Card>
          )}
          {bankStatus !== "VERIFIED" && (
            <Card>
              <CardBody>
                <p className="text-[length:var(--fs-3)] font-medium">{bankStatus === "REJECTED" ? "Bank details need fixing" : bankStatus ? "Bank details being checked" : "Add your bank details"}</p>
                <p className="text-[length:var(--fs-2)] text-muted-foreground">You are paid by bank transfer after each order closes.</p>
                <Link href="/settings/payouts" className={`${buttonVariants({ variant: "secondary", size: "sm" })} mt-3`}>
                  Bank details
                </Link>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </Page>
  );
}
