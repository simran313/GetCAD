// The summary sheet's timings (Phase 13a), from recorded events only: when the
// order was placed and confirmed (paid, clock started), and each status it
// reached, from the audit log. Nothing estimated; a milestone not reached is
// null. Framework-free and unit-tested.

export interface StatusStep {
  at: string;
  to: string | null;
}

export interface SummaryTimes {
  placedAt: string;
  confirmedAt: string | null;
  firstLookAt: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
  /** Revision rounds the order went through. */
  revisions: number;
  /** Confirmed → first look, in milliseconds. */
  firstLookMs: number | null;
  /** Confirmed → approved (or delivered, if approval was not recorded). */
  turnaroundMs: number | null;
}

const ms = (a: string | null, b: string | null) => (a && b ? Math.max(0, Date.parse(b) - Date.parse(a)) : null);

export function summaryTimes(placedAt: string, confirmedAt: string | null, steps: StatusStep[]): SummaryTimes {
  const sorted = [...steps].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const first = (to: string) => sorted.find((s) => s.to === to)?.at ?? null;
  const firstLookAt = first("CLIENT_PREVIEW");
  const approvedAt = first("APPROVED");
  const deliveredAt = first("DELIVERED");
  return {
    placedAt,
    confirmedAt,
    firstLookAt,
    approvedAt,
    deliveredAt,
    revisions: sorted.filter((s) => s.to === "REVISION_REQUESTED").length,
    firstLookMs: ms(confirmedAt, firstLookAt),
    turnaroundMs: ms(confirmedAt, approvedAt ?? deliveredAt),
  };
}

/** "45 min", "5 h 20 min", "2 d 3 h". */
export function durationWord(milliseconds: number | null): string {
  if (milliseconds == null) return "—";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} d${hours % 24 ? ` ${hours % 24} h` : ""}`;
}
