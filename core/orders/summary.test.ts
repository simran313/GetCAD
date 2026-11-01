import { describe, expect, it } from "vitest";

import { durationWord, summaryTimes } from "./summary";

describe("summary sheet timings", () => {
  const steps = [
    { at: "2026-11-01T10:00:00Z", to: "SUBMITTED" },
    { at: "2026-11-01T14:30:00Z", to: "CLIENT_PREVIEW" },
    { at: "2026-11-01T15:00:00Z", to: "REVISION_REQUESTED" },
    { at: "2026-11-01T17:00:00Z", to: "CLIENT_PREVIEW" },
    { at: "2026-11-02T09:00:00Z", to: "APPROVED" },
    { at: "2026-11-02T09:05:00Z", to: "DELIVERED" },
  ];

  it("measures from confirmation to the first first-look and to approval, and counts revisions", () => {
    const t = summaryTimes("2026-11-01T09:00:00Z", "2026-11-01T10:00:00Z", steps);
    expect(t.firstLookAt).toBe("2026-11-01T14:30:00Z");
    expect(t.firstLookMs).toBe(4.5 * 3_600_000);
    expect(t.turnaroundMs).toBe(23 * 3_600_000);
    expect(t.revisions).toBe(1);
  });

  it("leaves what did not happen empty, never estimated", () => {
    const t = summaryTimes("2026-11-01T09:00:00Z", null, [{ at: "2026-11-01T10:00:00Z", to: "SUBMITTED" }]);
    expect(t).toMatchObject({ firstLookAt: null, approvedAt: null, firstLookMs: null, turnaroundMs: null, revisions: 0 });
  });

  it("words durations", () => {
    expect(durationWord(null)).toBe("—");
    expect(durationWord(45 * 60_000)).toBe("45 min");
    expect(durationWord(5 * 3_600_000 + 20 * 60_000)).toBe("5 h 20 min");
    expect(durationWord(51 * 3_600_000)).toBe("2 d 3 h");
    expect(durationWord(2 * 3_600_000)).toBe("2 h");
  });
});
