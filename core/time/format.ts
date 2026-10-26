/**
 * Every date and time a person reads, in their own time zone.
 *
 * WHY THIS EXISTS. Screens used to format with `Intl.DateTimeFormat` and no
 * `timeZone`, which means "the zone of whatever computer runs this". Server
 * components run on the server, in UTC, so an order placed at 02:56 in India
 * showed as 9:26 PM the evening before. Every screen now formats through
 * these functions and passes the viewer's zone explicitly (lib/time/zone for
 * the server, useTimeZone for the browser).
 *
 * Pure: the zone and "now" are arguments, so the output is the same on the
 * server, in the browser and in a test.
 */

/** Used until the device has told us its zone, and for an unknown value. */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * The device's zone, kept in a cookie so the server can format with it
 * (owner decision: per device, no profile column). Set from the browser on
 * the first visit (components/time-zone) and changeable in Settings.
 */
export const TIME_ZONE_COOKIE = "tcp_tz";

/** True if the runtime knows this IANA zone name. */
export function isTimeZone(zone: string | null | undefined): zone is string {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const tz = isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  const key = `${tz}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz });
    cache.set(key, f);
  }
  return f;
}

const at = (iso: string | Date) => (iso instanceof Date ? iso : new Date(iso));

/** "9:26 PM" */
export function formatTime(iso: string | Date, zone: string): string {
  return fmt(zone, { hour: "numeric", minute: "2-digit" }).format(at(iso));
}

/** "Mon, Oct 12" — a day in a list. */
export function formatDay(iso: string | Date, zone: string): string {
  return fmt(zone, { weekday: "short", day: "numeric", month: "short" }).format(at(iso));
}

/** "Oct 12, 2026" — a date on a document or invoice. */
export function formatDate(iso: string | Date, zone: string): string {
  return fmt(zone, { day: "numeric", month: "short", year: "numeric" }).format(at(iso));
}

/** "Oct 12, 2026, 9:26 PM" — the full moment, for a timeline or a record. */
export function formatDateTime(iso: string | Date, zone: string): string {
  return fmt(zone, { dateStyle: "medium", timeStyle: "short" }).format(at(iso));
}

/** The calendar day of a moment in a zone, as YYYY-MM-DD. */
export function dayKey(iso: string | Date, zone: string): string {
  // en-CA formats as YYYY-MM-DD.
  const tz = isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at(iso));
}

/** Whole calendar days from `iso` to `now` in the zone (0 = same day). */
function daysBetween(iso: string | Date, now: Date, zone: string): number {
  const a = Date.parse(`${dayKey(iso, zone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now, zone)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * For lists: "just now", "2m ago", "3h ago" (today), "Yesterday 9:26 PM",
 * "Mon 9:26 PM" (this week), "Oct 12" (this year), "Oct 12, 2025".
 */
export function formatRelative(iso: string | Date, zone: string, now: Date = new Date()): string {
  const t = at(iso);
  const seconds = Math.round((now.getTime() - t.getTime()) / 1000);
  const days = daysBetween(t, now, zone);
  if (seconds >= 0 && days === 0) {
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  if (days === 1) return `Yesterday ${formatTime(t, zone)}`;
  if (days > 1 && days < 7) return `${fmt(zone, { weekday: "short" }).format(t)} ${formatTime(t, zone)}`;
  const sameYear = dayKey(t, zone).slice(0, 4) === dayKey(now, zone).slice(0, 4);
  return sameYear ? fmt(zone, { day: "numeric", month: "short" }).format(t) : formatDate(t, zone);
}

/**
 * A separator in a conversation: "Today", "Yesterday", "Monday",
 * "Oct 12" or "Oct 12, 2025".
 */
export function formatDayLabel(iso: string | Date, zone: string, now: Date = new Date()): string {
  const days = daysBetween(iso, now, zone);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return fmt(zone, { weekday: "long" }).format(at(iso));
  const sameYear = dayKey(iso, zone).slice(0, 4) === dayKey(now, zone).slice(0, 4);
  return sameYear ? fmt(zone, { day: "numeric", month: "short" }).format(at(iso)) : formatDate(iso, zone);
}
