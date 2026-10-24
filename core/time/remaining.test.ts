import { describe, expect, it } from "vitest";

import { remaining } from "./remaining";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const at = (mins: number) => new Date(NOW + mins * 60_000).toISOString();

describe("remaining (Phase 5 timers)", () => {
  it("says hours and minutes, dropping zero minutes", () => {
    expect(remaining(at(340), NOW)).toEqual({ text: "5 h 40 min", overdue: false, soon: false });
    expect(remaining(at(120), NOW)?.text).toBe("2 h");
  });

  it("flags the last hour as soon, never as less than a minute", () => {
    expect(remaining(at(35), NOW)).toEqual({ text: "35 min", overdue: false, soon: true });
    expect(remaining(new Date(NOW + 10_000).toISOString(), NOW)?.text).toBe("1 min");
  });

  it("counts overdue time, in days past two days", () => {
    expect(remaining(at(-125), NOW)).toEqual({ text: "Overdue 2 h 5 min", overdue: true, soon: false });
    expect(remaining(at(-3 * 24 * 60 - 5), NOW)?.text).toBe("Overdue 3 days");
  });

  it("returns null for a missing date", () => {
    expect(remaining("not a date", NOW)).toBeNull();
  });
});
