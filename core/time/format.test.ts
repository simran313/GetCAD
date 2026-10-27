import { describe, expect, it } from "vitest";

import { dayKey, formatDateTime, formatDay, formatDayLabel, formatRelative, formatTime, isTimeZone, TIME_ZONE_CHOICES } from "./format";

// 2026-10-25T21:26:00Z is 02:56 on 26 Oct in India, 5:26 PM on 25 Oct in New York.
const placed = "2026-10-25T21:26:00Z";

describe("formatting in the viewer's zone", () => {
  it("shows an order placed at 02:56 IST as 2:56 AM in India, not the server's 9:26 PM", () => {
    expect(formatTime(placed, "Asia/Kolkata")).toBe("2:56 AM");
    expect(formatTime(placed, "UTC")).toBe("9:26 PM");
    expect(formatTime(placed, "America/New_York")).toBe("5:26 PM");
  });

  it("puts the moment on the viewer's calendar day", () => {
    expect(formatDay(placed, "Asia/Kolkata")).toBe("Mon, Oct 26");
    expect(formatDay(placed, "America/Los_Angeles")).toBe("Sun, Oct 25");
    expect(dayKey(placed, "Asia/Kolkata")).toBe("2026-10-26");
  });

  it("gives the full moment for a timeline", () => {
    expect(formatDateTime(placed, "Asia/Kolkata")).toBe("Oct 26, 2026, 2:56 AM");
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    expect(isTimeZone("Not/AZone")).toBe(false);
    expect(isTimeZone("Asia/Kolkata")).toBe(true);
    expect(formatTime(placed, "Not/AZone")).toBe("9:26 PM");
  });
});

describe("relative times in lists", () => {
  const now = new Date("2026-10-26T10:00:00Z"); // 15:30 IST on 26 Oct
  it("counts minutes and hours on the same day", () => {
    expect(formatRelative("2026-10-26T09:59:30Z", "Asia/Kolkata", now)).toBe("just now");
    expect(formatRelative("2026-10-26T09:58:00Z", "Asia/Kolkata", now)).toBe("2m ago");
    expect(formatRelative("2026-10-26T07:00:00Z", "Asia/Kolkata", now)).toBe("3h ago");
  });

  it("says Yesterday by the viewer's calendar, not by 24 hours", () => {
    // 21:26 UTC on the 25th is 02:56 on the 26th in India: today there.
    expect(formatRelative(placed, "Asia/Kolkata", now)).toBe("12h ago");
    // In New York it is 06:00 on the 26th now, and the order was the 25th.
    expect(formatRelative(placed, "America/New_York", now)).toBe("Yesterday 5:26 PM");
  });

  it("uses the weekday within a week, then the date", () => {
    expect(formatRelative("2026-10-22T12:00:00Z", "UTC", now)).toBe("Thu 12:00 PM");
    expect(formatRelative("2026-09-01T12:00:00Z", "UTC", now)).toBe("Sep 1");
    expect(formatRelative("2025-09-01T12:00:00Z", "UTC", now)).toBe("Sep 1, 2025");
  });

  it("labels conversation days", () => {
    expect(formatDayLabel("2026-10-26T01:00:00Z", "UTC", now)).toBe("Today");
    expect(formatDayLabel("2026-10-25T01:00:00Z", "UTC", now)).toBe("Yesterday");
    expect(formatDayLabel("2026-10-22T01:00:00Z", "UTC", now)).toBe("Thursday");
  });
});

describe("TIME_ZONE_CHOICES (Settings)", () => {
  it("offers only zones the runtime knows, once each", () => {
    for (const c of TIME_ZONE_CHOICES) expect(isTimeZone(c.zone), c.zone).toBe(true);
    expect(new Set(TIME_ZONE_CHOICES.map((c) => c.zone)).size).toBe(TIME_ZONE_CHOICES.length);
  });
});

