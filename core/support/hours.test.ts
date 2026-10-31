import { describe, expect, it } from "vitest";

import { supportHoursLabel, supportOnline, supportStatusLabel, supportWindow } from "./hours";

describe("live support hours (3 PM – midnight India time)", () => {
  it("reads 5:30 AM – 2:30 PM ET in US daylight time and 4:30 AM – 1:30 PM ET in standard time", () => {
    expect(supportHoursLabel(new Date("2026-07-15T12:00:00Z"))).toBe("5:30 AM – 2:30 PM ET");
    expect(supportHoursLabel(new Date("2026-12-15T12:00:00Z"))).toBe("4:30 AM – 1:30 PM ET");
    // The Sunday the US clocks change (1 Nov 2026): already standard time.
    expect(supportHoursLabel(new Date("2026-11-02T12:00:00Z"))).toBe("4:30 AM – 1:30 PM ET");
  });

  it("is online from 09:30 to 18:30 UTC, every day", () => {
    expect(supportOnline(new Date("2026-07-15T09:29:00Z"))).toBe(false);
    expect(supportOnline(new Date("2026-07-15T09:30:00Z"))).toBe(true);
    expect(supportOnline(new Date("2026-12-20T18:29:00Z"))).toBe(true); // a Sunday
    expect(supportOnline(new Date("2026-12-20T18:30:00Z"))).toBe(false);
  });

  it("points to the next opening when offline", () => {
    const night = new Date("2026-07-15T20:00:00Z");
    expect(supportWindow(night).start.toISOString()).toBe("2026-07-16T09:30:00.000Z");
    expect(supportStatusLabel(night)).toBe("Live support opens at 5:30 AM ET");
    expect(supportStatusLabel(new Date("2026-07-15T10:00:00Z"))).toBe("Live support online");
  });

  it("can be read in the customer's own zone", () => {
    expect(supportHoursLabel(new Date("2026-07-15T12:00:00Z"), "America/Los_Angeles")).toBe("2:30 AM – 11:30 AM");
  });
});
