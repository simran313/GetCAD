import { describe, expect, it } from "vitest";

import { deltaWord, designerMetrics, periodRange, summarise, teamTotals, type ActivityRow } from "./metrics";

const H = 3_600_000;
const at = (h: number) => new Date(Date.UTC(2026, 10, 2, 0, 0) + h * H).toISOString();
const s = (order: string, designer: string, h: number, from: string | null, to: string): ActivityRow => ({
  order_id: order,
  designer_id: designer,
  at: at(h),
  kind: "STATUS",
  from_status: from,
  to_status: to,
});
const p = (order: string, designer: string, h: number, kind: "PAUSE" | "RESUME"): ActivityRow => ({
  order_id: order,
  designer_id: designer,
  at: at(h),
  kind,
  from_status: null,
  to_status: null,
});
const day = { from: new Date(at(0)), to: new Date(at(24)) };

describe("designerMetrics", () => {
  it("measures active time from start to submission, minus recorded pauses, and turnaround from assignment", () => {
    const rows = [
      s("a", "dana", 1, "PAYMENT_HELD", "ASSIGNED"),
      s("a", "dana", 2, "ASSIGNED", "IN_PROGRESS"),
      p("a", "dana", 3, "PAUSE"),
      p("a", "dana", 4, "RESUME"),
      s("a", "dana", 6, "DESIGNER_SUBMITTED", "QC_REVIEW"),
      s("a", "dana", 7, "QC_REVIEW", "CLIENT_PREVIEW"),
    ];
    const m = designerMetrics(rows, [{ order_id: "a", minutes: 240, designer_due_at: at(8) }], day).get("dana")!;
    expect(m).toMatchObject({ assigned: 1, started: 1, submitted: 1, passed: 1, onTime: 1, late: 0, firstPass: 1, minutesDelivered: 240 });
    expect(m.activeMs).toBe(3 * H); // 2 → 6 is 4 h, minus 1 h paused
    expect(m.pausedMs).toBe(1 * H);
    expect(m.turnaroundMs).toEqual([5 * H]);
    const sum = summarise(m);
    expect(sum.minutesPerActiveHour).toBe(80);
    expect(sum.onTimeRate).toBe(1);
  });

  it("tells QC rework from client changes, and first-pass from passed after rework", () => {
    const rows = [
      s("b", "ravi", 1, "PAYMENT_HELD", "ASSIGNED"),
      s("b", "ravi", 2, "ASSIGNED", "IN_PROGRESS"),
      s("b", "ravi", 4, "IN_PROGRESS", "QC_REVIEW"),
      s("b", "ravi", 5, "QC_REVIEW", "REVISION_REQUESTED"),
      s("b", "ravi", 6, "REVISION_REQUESTED", "IN_PROGRESS"),
      s("b", "ravi", 7, "IN_PROGRESS", "QC_REVIEW"),
      s("b", "ravi", 8, "QC_REVIEW", "CLIENT_PREVIEW"),
      s("b", "ravi", 9, "CLIENT_PREVIEW", "REVISION_REQUESTED"),
    ];
    const m = designerMetrics(rows, [{ order_id: "b", minutes: 60, designer_due_at: at(5) }], day).get("ravi")!;
    expect(m).toMatchObject({ submitted: 2, qcReturns: 1, clientChanges: 1, passed: 1, firstPass: 0, onTime: 1, late: 1 });
    expect(m.turnaroundMs).toEqual([3 * H]); // only the first submission counts
    expect(m.activeMs).toBe(2 * H + 1 * H);
    expect(summarise(m).firstPassRate).toBe(0);
  });

  it("gives each event to the designer who held the job then, and counts only the period", () => {
    const rows = [
      s("c", "dana", -30, "PAYMENT_HELD", "ASSIGNED"), // before the period: context only
      s("c", "dana", 1, "ASSIGNED", "IN_PROGRESS"),
      s("c", "ravi", 2, "IN_PROGRESS", "ASSIGNED"), // moved to Ravi
      s("c", "ravi", 3, "ASSIGNED", "IN_PROGRESS"),
      s("c", "ravi", 5, "IN_PROGRESS", "QC_REVIEW"),
    ];
    const ms = designerMetrics(rows, [{ order_id: "c", minutes: 60, designer_due_at: null }], day);
    expect(ms.get("dana")).toMatchObject({ assigned: 0, started: 1, submitted: 0 });
    expect(ms.get("ravi")).toMatchObject({ assigned: 1, started: 1, submitted: 1, onTime: 0, late: 0 });
    expect(ms.get("ravi")!.activeMs).toBe(2 * H);
    expect(teamTotals([...ms.values()])).toMatchObject({ started: 2, submitted: 1 });
  });

  it("a submission while paused closes the pause at submission", () => {
    const rows = [s("d", "dana", 1, "ASSIGNED", "IN_PROGRESS"), p("d", "dana", 2, "PAUSE"), s("d", "dana", 4, "IN_PROGRESS", "QC_REVIEW")];
    expect(designerMetrics(rows, [], day).get("dana")!.activeMs).toBe(1 * H);
  });
});

describe("periods and deltas", () => {
  it("today starts at local midnight; the previous period is the same length just before", () => {
    const now = new Date("2026-11-02T15:00:00Z");
    const { current, previous } = periodRange("today", now, undefined, 330); // India
    expect(current.from.toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(previous.to).toEqual(current.from);
    expect(current.to.getTime() - current.from.getTime()).toBe(previous.to.getTime() - previous.from.getTime());
    expect(periodRange("7d", now).current.from.toISOString()).toBe("2026-10-26T15:00:00.000Z");
    const c = periodRange("custom", now, { from: "2026-10-01", to: "2026-10-31" }).current;
    expect([c.from.toISOString(), c.to.toISOString()]).toEqual(["2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
  });

  it("words changes", () => {
    expect(deltaWord(12, 9)).toBe("+3");
    expect(deltaWord(0.8, 0.92, true)).toBe("−12 pts");
    expect(deltaWord(5, 5)).toBe("±0");
    expect(deltaWord(null, 3)).toBeNull();
  });
});
