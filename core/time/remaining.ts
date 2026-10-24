/**
 * How long until a deadline, in the words the mockups use (docs/design
 * timers): "5 h 40 min", "35 min", "Overdue 2 h", "Overdue 3 days".
 * Framework-free so the clock on an order, a job and the team board all say
 * the same thing, and so the wording is unit-tested.
 */
export interface Remaining {
  text: string;
  overdue: boolean;
  /** Within the last hour: the designer's 60-minute reminder window. */
  soon: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function span(ms: number): string {
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days`;
  if (ms >= HOUR) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MIN);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.max(1, Math.floor(ms / MIN))} min`;
}

export function remaining(dueIso: string, nowMs: number = Date.now()): Remaining | null {
  const due = Date.parse(dueIso);
  if (Number.isNaN(due)) return null;
  const left = due - nowMs;
  if (left <= 0) return { text: `Overdue ${span(-left)}`, overdue: true, soon: false };
  return { text: span(left), overdue: false, soon: left <= HOUR };
}
