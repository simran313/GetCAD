import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { durationWord, formatDateTime, jobState, type ActivityRow } from "@/core";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { designerName, loadPodReport, periodKey } from "@/lib/work/pod";
import { requireTeam } from "@/lib/work/team";
import type { PodJob } from "@/lib/work/load";

import { RefreshEvery } from "../../RefreshEvery";

/**
 * One designer (Phase 13c): their numbers for the period, every job they
 * have worked on with its recorded times, and the activity timeline — each
 * assignment, start, pause, resume, submission and QC outcome, as recorded.
 */
export const dynamic = "force-dynamic";

type Search = { period?: string; from?: string; to?: string };

const EVENT_WORDS = (r: ActivityRow): string => {
  if (r.kind === "PAUSE") return "Paused";
  if (r.kind === "RESUME") return "Resumed";
  const { from_status: from, to_status: to } = r;
  if (to === "ASSIGNED") return "Assigned";
  if (to === "IN_PROGRESS") return from === "REVISION_REQUESTED" ? "Started changes" : "Started";
  if (to === "QC_REVIEW" && from !== "QC_REVIEW") return "Submitted to QC";
  if (from === "QC_REVIEW" && to === "CLIENT_PREVIEW") return "Passed QC";
  if (from === "QC_REVIEW" && to === "REVISION_REQUESTED") return "Sent back by QC";
  if (from === "CLIENT_PREVIEW" && to === "REVISION_REQUESTED") return "Client asked for changes";
  if (to === "APPROVED") return "Client approved";
  if (to === "DELIVERED") return "Delivered";
  return `Moved to ${(to ?? "").toLowerCase().replace(/_/g, " ")}`;
};

interface HistoryRow {
  job: PodJob;
  assignedAt: string | null;
  submissions: number;
  qcReturns: number;
  clientChanges: number;
  activeMs: number | null;
  current: boolean;
}

export default async function DesignerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");
  const { id } = await params;
  const sp = await searchParams;
  const tz = await viewerZone();
  const [r, rates] = await Promise.all([
    loadPodReport(supabase, { period: periodKey(sp.period), from: sp.from, to: sp.to, zone: tz, filters: {} }),
    supabase.rpc("team_designer_rates"),
  ]);
  // 0065: the pod lead sees the rate and cannot change it (an admin sets it).
  const rate = ((rates.data ?? []) as { designer_id: string; paise_per_minute: number; is_custom: boolean }[]).find((x) => x.designer_id === id);
  const d = r.allDesigners.find((x) => x.designer_id === id);
  if (!d) {
    return (
      <Page>
        <Link href="/pod/performance" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
          ← Performance
        </Link>
        <Card className="mt-6 p-[var(--s-10)] text-center text-[length:var(--fs-3)]">Not a designer in your pod.</Card>
      </Page>
    );
  }
  const m = r.current.get(id);
  const live = r.live.get(id);
  const mine = r.activity.filter((a) => a.designer_id === id);
  const jobIds = [...new Set([...mine.map((a) => a.order_id), ...r.allJobs.filter((j) => j.designer_id === id).map((j) => j.order_id)])];
  const history: HistoryRow[] = jobIds
    .map((oid) => {
      const job = r.allJobs.find((j) => j.order_id === oid);
      if (!job) return null;
      const ev = mine.filter((a) => a.order_id === oid);
      const current = job.designer_id === id;
      const t = r.times.get(oid);
      return {
        job,
        assignedAt: ev.filter((a) => a.to_status === "ASSIGNED").at(-1)?.at ?? null,
        submissions: ev.filter((a) => a.to_status === "QC_REVIEW" && a.from_status !== "QC_REVIEW").length,
        qcReturns: ev.filter((a) => a.from_status === "QC_REVIEW" && a.to_status === "REVISION_REQUESTED").length,
        clientChanges: ev.filter((a) => a.from_status === "CLIENT_PREVIEW" && a.to_status === "REVISION_REQUESTED").length,
        activeMs: current && t?.active_seconds != null ? t.active_seconds * 1000 : null,
        current,
      };
    })
    .filter((x): x is HistoryRow => !!x)
    .sort((a, b) => (b.assignedAt ?? b.job.created_at).localeCompare(a.assignedAt ?? a.job.created_at));

  const columns: Column<HistoryRow>[] = [
    {
      key: "job",
      header: "Job",
      card: "title",
      cell: (h) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{h.job.title}</span>
          <span className="block font-mono text-[length:var(--fs-1)] text-muted-foreground">{h.job.order_ref}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      card: "badge",
      className: "whitespace-nowrap",
      cell: (h) =>
        h.current ? (
          <StatusTag kind={r.times.get(h.job.order_id)?.paused_at ? "needs" : jobState(h.job.status).kind}>
            {r.times.get(h.job.order_id)?.paused_at ? "Paused" : jobState(h.job.status).word}
          </StatusTag>
        ) : (
          <StatusTag kind="muted">Moved on</StatusTag>
        ),
    },
    { key: "cat", header: "Category", cell: (h) => <CategoryBadge letter={h.job.category} /> },
    { key: "assigned", header: "Assigned", className: "whitespace-nowrap", cell: (h) => (h.assignedAt ? formatDateTime(h.assignedAt, tz) : "—") },
    { key: "active", header: "Working time", align: "right", className: "tabular whitespace-nowrap", cell: (h) => (h.activeMs != null ? durationWord(h.activeMs) : "—") },
    { key: "sub", header: "Submissions", align: "right", className: "tabular", cell: (h) => h.submissions },
    { key: "qc", header: "QC returns", align: "right", className: "tabular", cell: (h) => h.qcReturns },
    { key: "client", header: "Client changes", align: "right", className: "tabular", cell: (h) => h.clientChanges },
  ];

  const stats: [string, string][] = m
    ? [
        [String(m.submitted), "submitted"],
        [String(m.passed), "passed QC"],
        [m.avgActiveMs != null ? durationWord(m.avgActiveMs) : "—", "avg working time"],
        [m.avgTurnaroundMs != null ? durationWord(m.avgTurnaroundMs) : "—", "avg turnaround"],
        [m.onTimeRate != null ? `${Math.round(m.onTimeRate * 100)}%` : "—", "on time"],
        [m.firstPassRate != null ? `${Math.round(m.firstPassRate * 100)}%` : "—", "first-pass QC"],
      ]
    : [];

  return (
    <Page>
      <RefreshEvery seconds={60} />
      <Link href={`/pod/performance${sp.period ? `?period=${sp.period}` : ""}`} className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Performance
      </Link>
      <PageHeader
        eyebrow={[
          d.designer_ref,
          d.pod_name,
          rate ? `₹${(rate.paise_per_minute / 100).toFixed(2)} a minute${rate.is_custom ? " (own rate, set by an admin)" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        title={designerName(d)}
        description={
          live
            ? `Now: ${live.open} open job${live.open === 1 ? "" : "s"}, ${live.openMinutes}/${live.shiftMinutes} min${live.paused ? `, ${live.paused} paused` : ""}${live.overdue ? `, ${live.overdue} overdue` : ""}.`
            : undefined
        }
      />
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border shadow-[var(--e-1)] sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([v, l]) => (
            <div key={l} className="flex flex-col gap-0.5 bg-card px-4 py-3">
              <dt className="order-2 text-[length:var(--fs-2)] text-muted-foreground">{l}</dt>
              <dd className="tabular text-[22px] font-semibold leading-8">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <section aria-labelledby="history-title" className="space-y-3">
        <h2 id="history-title" className="text-[length:var(--fs-4)] font-semibold">
          Job history
        </h2>
        <ResponsiveDataList
          caption="Job history"
          columns={columns}
          rows={history}
          rowKey={(h) => h.job.order_id}
          rowHref={(h) => `/orders/${h.job.order_id}`}
          linkKey="job"
          empty={<Card className="p-[var(--s-6)] text-[length:var(--fs-3)] text-muted-foreground">No jobs yet.</Card>}
        />
      </section>

      <Card as="section">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <span className="text-[length:var(--fs-2)] text-muted-foreground">Last 200, newest first</span>
        </CardHeader>
        <CardBody>
          {mine.length === 0 ? (
            <p className="text-[length:var(--fs-2)] text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="divide-y divide-border">
              {[...mine]
                .reverse()
                .slice(0, 200)
                .map((a, i) => {
                  const job = r.allJobs.find((j) => j.order_id === a.order_id);
                  return (
                    <li key={`${a.order_id}-${a.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[length:var(--fs-3)]">
                      <span>
                        {EVENT_WORDS(a)}{" "}
                        <Link href={`/orders/${a.order_id}`} className="font-mono text-[length:var(--fs-2)] text-muted-foreground underline-offset-4 hover:underline">
                          {job?.order_ref ?? ""}
                        </Link>
                      </span>
                      <time dateTime={a.at} className="tabular text-[length:var(--fs-2)] text-muted-foreground">
                        {formatDateTime(a.at, tz)}
                      </time>
                    </li>
                  );
                })}
            </ol>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}
