import { describe, expect, it } from "vitest";

import { isOpenJob, jobClockDue, jobState, jobTab, loadWord, minutesWord, qcPayoutPaise, rupeesWord } from "./view";

describe("jobTab / jobState", () => {
  it("sorts statuses into the designer's three tabs", () => {
    expect(["ASSIGNED", "IN_PROGRESS", "REVISION_REQUESTED"].map(jobTab)).toEqual(["open", "open", "open"]);
    expect(jobTab("QC_REVIEW")).toBe("qc");
    expect(["CLIENT_PREVIEW", "APPROVED", "CLOSED"].map(jobTab)).toEqual(["done", "done", "done"]);
    expect(isOpenJob("QC_REVIEW")).toBe(true);
    expect(isOpenJob("CLOSED")).toBe(false);
  });

  it("names the state the way the mockups do", () => {
    expect(jobState("ASSIGNED")).toEqual({ word: "Not started", kind: "muted" });
    expect(jobState("REVISION_REQUESTED")).toEqual({ word: "Revision", kind: "needs" });
    expect(jobState("QC_REVIEW").word).toBe("In QC");
    expect(jobState("PAYOUT_RELEASED").word).toBe("Done");
  });
});

describe("minutesWord / jobClockDue", () => {
  it("prints category time like the mockups", () => {
    expect([15, 45, 60, 90, 120, 180].map(minutesWord)).toEqual(["15 MIN", "45 MIN", "1 H", "90 MIN", "2 H", "3 H"]);
    expect(minutesWord(null)).toBe("");
  });

  it("runs the designer's clock from Start work", () => {
    expect(jobClockDue("2026-11-04T09:00:00.000Z", 90)).toBe("2026-11-04T10:30:00.000Z");
    expect(jobClockDue(null, 90)).toBeNull();
  });
});

describe("qcPayoutPaise (DECISIONS §5)", () => {
  it("matches the worked examples", () => {
    expect([3000, 5500, 6000, 8500, 18000].map((c) => qcPayoutPaise(c) / 100)).toEqual([500, 900, 1000, 1400, 3000]);
    expect(qcPayoutPaise(32000) / 100).toBe(5350);
    expect(qcPayoutPaise(1000) / 100).toBe(500);
  });

  it("formats rupees and load", () => {
    expect(rupeesWord(150000)).toBe("₹1,500");
    expect(loadWord(0, 480)).toBe("FREE · 0 / 480 MIN");
    expect(loadWord(270, 480)).toBe("270 / 480 MIN");
  });
});
