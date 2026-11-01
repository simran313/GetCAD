import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  designerBucket,
  designerMetrics,
  isOpenJob,
  periodRange,
  summarise,
  teamTotals,
  type ActivityRow,
  type DesignerSummary,
  type JobTimes,
  type Period,
  type PeriodKey,
} from "@/core";

import { loadJobTimes, loadPodJobs, loadPodLoad, type PodDesignerLoad, type PodJob } from "./load";

/**
 * Everything the pod lead's performance screens and exports show (Phase 13c),
 * read as the caller: pod_jobs / pod_load / job_times / pod_activity scope a
 * pod lead to their pods and an admin to all. Metrics come from
 * core/work/metrics over the recorded events; the live state from the jobs
 * as they are now.
 */
export interface PodFilters {
  designer?: string;
  category?: string;
  product?: string;
  status?: string;
}

export interface DesignerLive {
  open: number;
  openMinutes: number;
  shiftMinutes: number;
  paused: number;
  overdue: number;
  withQc: number;
  changes: number;
}

export interface Escalation {
  id: string;
  order_id: string;
  order_ref: string | null;
  pod_name: string | null;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export interface PodReport {
  period: Period;
  previous: Period;
  designers: PodDesignerLoad[];
  /** Every designer in scope, for the filter. */
  allDesigners: PodDesignerLoad[];
  jobs: PodJob[];
  /** Every job in scope, filters ignored (a designer's history includes jobs moved away). */
  allJobs: PodJob[];
  activity: ActivityRow[];
  times: Map<string, JobTimes>;
  current: Map<string, DesignerSummary>;
  before: Map<string, DesignerSummary>;
  team: DesignerSummary;
  teamBefore: DesignerSummary;
  live: Map<string, DesignerLive>;
  bottlenecks: {
    unassigned: number;
    oldestUnassignedAt: string | null;
    waitingQc: number;
    oldestQcAt: string | null;
    overdue: number;
    paused: number;
    idle: PodDesignerLoad[];
    /** Most and least loaded assignable designers, when the gap is over half a shift. */
    imbalance: { most: PodDesignerLoad; least: PodDesignerLoad } | null;
  };
  escalations: Escalation[];
  /** Whether 0057/0058 are applied (else times and activity are empty). */
  complete: boolean;
}

/** Minutes ahead of UTC in a time zone right now ("+05:30" → 330). */
export function zoneOffsetMinutes(zone: string, at = new Date()): number {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return 0;
  }
}

const PERIODS: PeriodKey[] = ["today", "7d", "30d", "custom"];
export const periodKey = (raw: string | undefined): PeriodKey => (PERIODS.includes(raw as PeriodKey) ? (raw as PeriodKey) : "7d");

export async function loadPodReport(
  s: SupabaseClient,
  opts: { period: PeriodKey; from?: string; to?: string; zone: string; filters: PodFilters; now?: Date },
): Promise<PodReport> {
  const now = opts.now ?? new Date();
  const { current: period, previous } = periodRange(opts.period, now, { from: opts.from, to: opts.to }, zoneOffsetMinutes(opts.zone, now));
  // Context before the earlier period: when versions started and were assigned.
  const since = new Date(previous.from.getTime() - 30 * 86_400_000).toISOString();

  const [allJobs, allDesigners, times, activityRes, escalationsRes] = await Promise.all([
    loadPodJobs(s),
    loadPodLoad(s),
    loadJobTimes(s),
    s.rpc("pod_activity", { p_since: since }),
    s.rpc("job_escalations_list", { p_include_resolved: false }),
  ]);
  const complete = !activityRes.error;
  const f = opts.filters;
  const jobs = allJobs.filter(
    (j) =>
      (!f.category || j.category === f.category) &&
      (!f.product || j.product === f.product) &&
      (!f.status || j.status === f.status) &&
      (!f.designer || j.designer_id === f.designer),
  );
  const jobIds = new Set(jobs.map((j) => j.order_id));
  const designers = allDesigners.filter((d) => !f.designer || d.designer_id === f.designer);
  const activity = ((activityRes.data ?? []) as ActivityRow[]).filter((r) => jobIds.has(r.order_id) || (!f.category && !f.product && !f.status && !f.designer));

  const metricJobs = allJobs.map((j) => ({ order_id: j.order_id, minutes: j.minutes, designer_due_at: j.designer_due_at }));
  const toSummaries = (p: Period) => {
    const m = designerMetrics(activity, metricJobs, p);
    for (const d of designers) if (!m.has(d.designer_id)) m.set(d.designer_id, emptyFor(d.designer_id));
    const out = new Map<string, DesignerSummary>();
    for (const [id, v] of m) if (designers.some((d) => d.designer_id === id)) out.set(id, summarise(v));
    return out;
  };
  const current = toSummaries(period);
  const before = toSummaries(previous);

  const nowMs = now.getTime();
  const live = new Map<string, DesignerLive>();
  for (const d of designers) {
    const mine = allJobs.filter((j) => j.designer_id === d.designer_id && isOpenJob(j.status));
    const bucket = (j: PodJob) => designerBucket(j.status, j.status === "IN_PROGRESS" && !!times.get(j.order_id)?.paused_at);
    live.set(d.designer_id, {
      open: mine.length,
      openMinutes: d.open_minutes,
      shiftMinutes: d.shift_minutes,
      paused: mine.filter((j) => bucket(j) === "paused").length,
      overdue: mine.filter((j) => ["new", "working", "paused", "changes"].includes(bucket(j)) && j.designer_due_at && Date.parse(j.designer_due_at) < nowMs).length,
      withQc: mine.filter((j) => bucket(j) === "qc").length,
      changes: mine.filter((j) => bucket(j) === "changes").length,
    });
  }

  const unassigned = jobs.filter((j) => j.status === "PAYMENT_HELD");
  const qc = jobs.filter((j) => j.status === "QC_REVIEW");
  const assignable = designers.filter((d) => d.assignable);
  const sorted = [...assignable].sort((a, b) => b.open_minutes - a.open_minutes);
  const most = sorted[0];
  const least = sorted.at(-1);
  const oldest = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;

  return {
    period,
    previous,
    designers,
    allDesigners,
    jobs,
    allJobs,
    activity,
    times,
    current,
    before,
    team: teamTotals([...current.values()]),
    teamBefore: teamTotals([...before.values()]),
    live,
    bottlenecks: {
      unassigned: unassigned.length,
      oldestUnassignedAt: oldest(unassigned.map((j) => j.paid_at ?? j.created_at)),
      waitingQc: qc.length,
      oldestQcAt: oldest(qc.map((j) => j.submitted_at)),
      overdue: [...live.values()].reduce((n, l) => n + l.overdue, 0),
      paused: [...live.values()].reduce((n, l) => n + l.paused, 0),
      idle: assignable.filter((d) => (live.get(d.designer_id)?.open ?? 0) === 0),
      imbalance: most && least && most !== least && most.open_minutes - least.open_minutes > most.shift_minutes / 2 ? { most, least } : null,
    },
    escalations: (escalationsRes.data ?? []) as Escalation[],
    complete,
  };
}

function emptyFor(designerId: string) {
  return {
    designerId,
    assigned: 0,
    started: 0,
    submitted: 0,
    passed: 0,
    qcReturns: 0,
    clientChanges: 0,
    onTime: 0,
    late: 0,
    activeMs: 0,
    pausedMs: 0,
    minutesDelivered: 0,
    turnaroundMs: [],
    firstPass: 0,
  };
}

/** A designer's name as the pod lead knows them. */
export const designerName = (d: Pick<PodDesignerLoad, "name" | "designer_ref"> | undefined) => d?.name ?? d?.designer_ref ?? "Designer";
