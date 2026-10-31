// Live support hours (owner, 31 Oct 2026). The portal is open 24/7; a person
// answers calls and WhatsApp from 3 PM to midnight India time, every day,
// which is 5:30 AM – 2:30 PM ET while the US is on daylight time and
// 4:30 AM – 1:30 PM ET in standard time. India has no daylight saving, so the
// window is fixed in UTC (09:30–18:30) and the ET wording follows the US clock
// by itself. Framework-free: unit-tested, used on the website and the portal.

import { dayKey } from "../time/format";

const ZONE = "Asia/Kolkata";
/** 15:00 India time. */
const OPEN_MINUTE = 15 * 60;
/** Midnight India time. */
const CLOSE_MINUTE = 24 * 60;
/** How customers in the US read it (DECISIONS: ET is the primary zone). */
export const SUPPORT_DISPLAY_ZONE = "America/New_York";

/** Minutes past midnight in India for a moment. */
function indiaMinute(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

/** Whether a person is answering right now. */
export function supportOnline(at: Date = new Date()): boolean {
  const m = indiaMinute(at);
  return m >= OPEN_MINUTE && m < CLOSE_MINUTE;
}

/** The support window that is open now, or the next one: start and end instants. */
export function supportWindow(at: Date = new Date()): { start: Date; end: Date } {
  // India is UTC+5:30 all year: 15:00 IST = 09:30 UTC, midnight IST = 18:30 UTC.
  const day = dayKey(at, ZONE); // YYYY-MM-DD in India
  const start = new Date(`${day}T09:30:00Z`);
  const end = new Date(start.getTime() + (CLOSE_MINUTE - OPEN_MINUTE) * 60_000);
  if (at < end) return { start, end };
  return { start: new Date(start.getTime() + 86_400_000), end: new Date(end.getTime() + 86_400_000) };
}

const time = (at: Date, zone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);

/** "5:30 AM – 2:30 PM ET" (or "4:30 AM – 1:30 PM ET" in US standard time). */
export function supportHoursLabel(at: Date = new Date(), zone: string = SUPPORT_DISPLAY_ZONE): string {
  const { start, end } = supportWindow(at);
  const suffix = zone === SUPPORT_DISPLAY_ZONE ? " ET" : "";
  return `${time(start, zone)} – ${time(end, zone)}${suffix}`;
}

/** "Live support online" / "Live support opens at 5:30 AM ET". */
export function supportStatusLabel(at: Date = new Date()): string {
  if (supportOnline(at)) return "Live support online";
  return `Live support opens at ${time(supportWindow(at).start, SUPPORT_DISPLAY_ZONE)} ET`;
}
