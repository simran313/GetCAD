import "server-only";

import { formatDateTime, type Cell, type Sheet } from "@/core";

import { designerName, type PodReport } from "./pod";

/**
 * The pod report's tables (Phase 13c): designer-wise, job-wise and the raw
 * activity, the same numbers the Performance screen shows. Hours as numbers
 * (two decimals) so a spreadsheet can sum them.
 */
const hours = (ms: number | null | undefined) => (ms == null ? null : Math.round((ms / 3_600_000) * 100) / 100);
const rate = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);

const EVENT = (kind: string, from: string | null, to: string | null) => {
  if (kind === "PAUSE") return "Paused";
  if (kind === "RESUME") return "Resumed";
  if (to === "QC_REVIEW" && from !== "QC_REVIEW") return "Submitted to QC";
  if (from === "QC_REVIEW" && to === "CLIENT_PREVIEW") return "Passed QC";
  if (from === "QC_REVIEW" && to === "REVISION_REQUESTED") return "Sent back by QC";
  if (from === "CLIENT_PREVIEW" && to === "REVISION_REQUESTED") return "Client asked for changes";
  return `${from ?? ""} → ${to ?? ""}`;
};

export function designerRows(r: PodReport): Cell[][] {
  const header: Cell[] = [
    "Designer", "Ref", "Pod", "Assigned", "Started", "Submitted", "Passed QC", "QC returns", "Client changes",
    "On time", "Late", "On-time %", "First-pass QC %", "Avg working hours", "Avg turnaround hours",
    "Working hours", "Paused hours", "Category minutes delivered", "Minutes per working hour",
    "Open now", "Open minutes", "Shift minutes", "Paused now", "Overdue now",
  ];
  const rows = r.designers.map((d) => {
    const m = r.current.get(d.designer_id)!;
    const l = r.live.get(d.designer_id);
    return [
      designerName(d), d.designer_ref, d.pod_name, m.assigned, m.started, m.submitted, m.passed, m.qcReturns, m.clientChanges,
      m.onTime, m.late, rate(m.onTimeRate), rate(m.firstPassRate), hours(m.avgActiveMs), hours(m.avgTurnaroundMs),
      hours(m.activeMs), hours(m.pausedMs), m.minutesDelivered, m.minutesPerActiveHour == null ? null : Math.round(m.minutesPerActiveHour),
      l?.open ?? null, l?.openMinutes ?? null, l?.shiftMinutes ?? null, l?.paused ?? null, l?.overdue ?? null,
    ];
  });
  const t = r.team;
  rows.push([
    "Team", null, null, t.assigned, t.started, t.submitted, t.passed, t.qcReturns, t.clientChanges,
    t.onTime, t.late, rate(t.onTimeRate), rate(t.firstPassRate), hours(t.avgActiveMs), hours(t.avgTurnaroundMs),
    hours(t.activeMs), hours(t.pausedMs), t.minutesDelivered, t.minutesPerActiveHour == null ? null : Math.round(t.minutesPerActiveHour),
    null, null, null, r.bottlenecks.paused, r.bottlenecks.overdue,
  ]);
  return [header, ...rows];
}

export function jobRows(r: PodReport, zone: string): Cell[][] {
  const names = new Map(r.allDesigners.map((d) => [d.designer_id, designerName(d)]));
  const when = (iso: string | null) => (iso ? formatDateTime(iso, zone) : null);
  const now = Date.now();
  return [
    ["Order", "Title", "Job type", "Category", "Category minutes", "Status", "Designer", "Version", "Started", "Submitted", "Working hours", "Paused hours", "Due to QC", "Overdue now"],
    ...r.jobs.map((j) => {
      const t = r.times.get(j.order_id);
      const open = ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(j.status);
      return [
        j.order_ref, j.title, j.product, j.category, j.minutes, j.status, j.designer_id ? (names.get(j.designer_id) ?? j.designer_ref) : null, j.work_version,
        when(t?.started_at ?? j.started_at), when(t?.submitted_at ?? null),
        t?.active_seconds != null ? hours(t.active_seconds * 1000) : null, t ? hours(t.paused_seconds * 1000) : null,
        when(j.designer_due_at), open && j.designer_due_at && Date.parse(j.designer_due_at) < now ? "Yes" : open ? "No" : null,
      ];
    }),
  ];
}

export function activityRows(r: PodReport, zone: string): Cell[][] {
  const names = new Map(r.allDesigners.map((d) => [d.designer_id, designerName(d)]));
  const refs = new Map(r.allJobs.map((j) => [j.order_id, j.order_ref]));
  const from = r.period.from.getTime();
  const to = r.period.to.getTime();
  return [
    ["When", "Order", "Designer", "Event"],
    ...r.activity
      .filter((a) => Date.parse(a.at) >= from && Date.parse(a.at) < to)
      .map((a) => [formatDateTime(a.at, zone), refs.get(a.order_id) ?? a.order_id, a.designer_id ? (names.get(a.designer_id) ?? null) : null, EVENT(a.kind, a.from_status, a.to_status)]),
  ];
}

export function reportSheets(r: PodReport, zone: string): Sheet[] {
  return [
    { name: "Designers", rows: designerRows(r) },
    { name: "Jobs", rows: jobRows(r, zone) },
    { name: "Activity", rows: activityRows(r, zone) },
  ];
}
