// Pod performance (Phase 13c), computed from recorded events only: each
// status change and pause from pod_activity() (0058), attributed to the
// designer who held the job at that moment. Nothing is estimated: a number
// the record cannot support is left null rather than guessed.
// Framework-free and unit-tested.

export interface ActivityRow {
  order_id: string;
  designer_id: string | null;
  at: string;
  kind: "STATUS" | "PAUSE" | "RESUME";
  from_status: string | null;
  to_status: string | null;
}

/** What the reports need to know about a job besides its events. */
export interface MetricJob {
  order_id: string;
  minutes: number | null;
  designer_due_at: string | null;
}

export interface Period {
  from: Date;
  to: Date;
}

export interface DesignerMetrics {
  designerId: string;
  assigned: number;
  started: number;
  submitted: number;
  /** Passed QC (on to the client). */
  passed: number;
  /** Sent back by QC: rework. */
  qcReturns: number;
  /** Changes the client asked for after seeing the design. */
  clientChanges: number;
  /** Submissions before the job's due time to QC. */
  onTime: number;
  late: number;
  /** Working time (start → submit, minus pauses) of the period's submissions. */
  activeMs: number;
  pausedMs: number;
  /** Category minutes of the work that passed QC. */
  minutesDelivered: number;
  /** Assigned → first submission, for jobs first submitted in the period. */
  turnaroundMs: number[];
  /** Passed with no QC return on that version. */
  firstPass: number;
}

export interface DesignerSummary extends DesignerMetrics {
  avgActiveMs: number | null;
  avgTurnaroundMs: number | null;
  onTimeRate: number | null;
  firstPassRate: number | null;
  /** Category minutes delivered per hour actually worked. */
  minutesPerActiveHour: number | null;
}

const empty = (designerId: string): DesignerMetrics => ({
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
});

const t = (iso: string) => Date.parse(iso);

/**
 * Walk each job's events in order and count, per designer, what happened in
 * the period. Events before the period are read only for context (when the
 * current version started, when it was assigned).
 */
export function designerMetrics(rows: ActivityRow[], jobs: MetricJob[], period: Period): Map<string, DesignerMetrics> {
  const jobsById = new Map(jobs.map((j) => [j.order_id, j]));
  const out = new Map<string, DesignerMetrics>();
  const of = (id: string) => out.get(id) ?? (out.set(id, empty(id)), out.get(id)!);
  const inPeriod = (at: number) => at >= period.from.getTime() && at < period.to.getTime();

  const byOrder = new Map<string, ActivityRow[]>();
  for (const r of rows) (byOrder.get(r.order_id) ?? byOrder.set(r.order_id, []).get(r.order_id)!).push(r);

  for (const [orderId, events] of byOrder) {
    events.sort((a, b) => t(a.at) - t(b.at) || (a.kind === "STATUS" ? 1 : 0) - (b.kind === "STATUS" ? 1 : 0));
    const job = jobsById.get(orderId);
    let assignedAt: number | null = null;
    let startAt: number | null = null;
    let pausedMs = 0;
    let pauseOpen: number | null = null;
    let returnedThisVersion = false;
    const submittedBy = new Set<string>();

    for (const e of events) {
      const at = t(e.at);
      const d = e.designer_id;
      if (e.kind === "PAUSE") {
        pauseOpen = at;
        continue;
      }
      if (e.kind === "RESUME") {
        if (pauseOpen != null) {
          pausedMs += at - pauseOpen;
          if (d && inPeriod(at)) of(d).pausedMs += at - pauseOpen;
        }
        pauseOpen = null;
        continue;
      }
      const to = e.to_status;
      const from = e.from_status;
      if (to === "ASSIGNED") {
        assignedAt = at;
        startAt = null;
        if (d && inPeriod(at)) of(d).assigned++;
      } else if (to === "IN_PROGRESS") {
        startAt = at;
        pausedMs = 0;
        pauseOpen = null;
        if (d && inPeriod(at)) of(d).started++;
      } else if (to === "QC_REVIEW" && from !== "QC_REVIEW") {
        if (pauseOpen != null) {
          pausedMs += at - pauseOpen;
          pauseOpen = null;
        }
        if (d && inPeriod(at)) {
          const m = of(d);
          m.submitted++;
          if (startAt != null) m.activeMs += Math.max(0, at - startAt - pausedMs);
          const due = job?.designer_due_at ? t(job.designer_due_at) : null;
          if (due != null) {
            if (at <= due) m.onTime++;
            else m.late++;
          }
          if (assignedAt != null && !submittedBy.has(d)) m.turnaroundMs.push(at - assignedAt);
        }
        if (d) submittedBy.add(d);
        startAt = null;
      } else if (from === "QC_REVIEW" && to === "CLIENT_PREVIEW") {
        if (d && inPeriod(at)) {
          const m = of(d);
          m.passed++;
          m.minutesDelivered += job?.minutes ?? 0;
          if (!returnedThisVersion) m.firstPass++;
        }
        returnedThisVersion = false;
      } else if (from === "QC_REVIEW" && to === "REVISION_REQUESTED") {
        returnedThisVersion = true;
        if (d && inPeriod(at)) of(d).qcReturns++;
      } else if (from === "CLIENT_PREVIEW" && to === "REVISION_REQUESTED") {
        returnedThisVersion = false;
        if (d && inPeriod(at)) of(d).clientChanges++;
      }
    }
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function summarise(m: DesignerMetrics): DesignerSummary {
  return {
    ...m,
    avgActiveMs: m.submitted ? m.activeMs / m.submitted : null,
    avgTurnaroundMs: avg(m.turnaroundMs),
    onTimeRate: ratio(m.onTime, m.onTime + m.late),
    firstPassRate: ratio(m.firstPass, m.passed + m.qcReturns),
    minutesPerActiveHour: m.activeMs > 0 && m.minutesDelivered > 0 ? m.minutesDelivered / (m.activeMs / 3_600_000) : null,
  };
}

/** The team's totals: every designer's counts added up. */
export function teamTotals(all: DesignerMetrics[]): DesignerSummary {
  const sum = all.reduce((acc, m) => {
    for (const k of ["assigned", "started", "submitted", "passed", "qcReturns", "clientChanges", "onTime", "late", "activeMs", "pausedMs", "minutesDelivered", "firstPass"] as const) {
      acc[k] += m[k];
    }
    acc.turnaroundMs.push(...m.turnaroundMs);
    return acc;
  }, empty("team"));
  return summarise(sum);
}

export type PeriodKey = "today" | "7d" | "30d" | "custom";

/**
 * The period a report covers, and the one before it of the same length (for
 * the comparison). "today" starts at midnight in the viewer's zone offset
 * given in minutes.
 */
export function periodRange(key: PeriodKey, now: Date, custom?: { from?: string; to?: string }, offsetMinutes = 0): { current: Period; previous: Period } {
  const day = 86_400_000;
  let from: Date;
  let to = now;
  if (key === "custom" && custom?.from) {
    from = new Date(`${custom.from}T00:00:00Z`);
    to = custom.to ? new Date(Date.parse(`${custom.to}T00:00:00Z`) + day) : now;
    from = new Date(from.getTime() - offsetMinutes * 60_000);
    to = new Date(to.getTime() - offsetMinutes * 60_000);
  } else if (key === "today") {
    const local = now.getTime() + offsetMinutes * 60_000;
    from = new Date(Math.floor(local / day) * day - offsetMinutes * 60_000);
  } else {
    from = new Date(now.getTime() - (key === "30d" ? 30 : 7) * day);
  }
  if (!(from < to)) from = new Date(to.getTime() - day);
  const length = to.getTime() - from.getTime();
  return { current: { from, to }, previous: { from: new Date(from.getTime() - length), to: from } };
}

/** "+3", "−12%", "±0": a change against the previous period. */
export function deltaWord(now: number | null, before: number | null, percent = false): string | null {
  if (now == null || before == null) return null;
  const d = now - before;
  if (Math.abs(d) < (percent ? 0.005 : 0.5)) return "±0";
  const sign = d > 0 ? "+" : "−";
  return percent ? `${sign}${Math.round(Math.abs(d) * 100)} pts` : `${sign}${Math.round(Math.abs(d))}`;
}
