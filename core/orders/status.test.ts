import { describe, expect, it } from "vitest";

import { ORDER_STATUS_META, statusKind, statusMeta } from "./status";

describe("statusMeta", () => {
  it("maps known statuses to a label + tone", () => {
    expect(statusMeta("IN_PROGRESS")).toEqual({ label: "In progress", tone: "info" });
    expect(statusMeta("DISPUTED").tone).toBe("danger");
    expect(statusMeta("APPROVED").tone).toBe("success");
    expect(statusMeta("CLIENT_PREVIEW").tone).toBe("attention");
  });

  it("every known status has a non-empty label and a valid tone", () => {
    const tones = ["neutral", "info", "attention", "success", "danger"];
    for (const [, meta] of Object.entries(ORDER_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(tones).toContain(meta.tone);
    }
  });

  it("humanises unknown statuses as a neutral fallback (never throws)", () => {
    expect(statusMeta("SOME_NEW_STATE")).toEqual({ label: "Some new state", tone: "neutral" });
  });
});

describe("statusKind (Phase 5, docs/design tags)", () => {
  it("asks for action on revisions, previews and disputes", () => {
    for (const s of ["REVISION_REQUESTED", "CLIENT_PREVIEW", "DISPUTED"]) expect(statusKind(s)).toBe("needs");
  });
  it("is in flight from submission to QC", () => {
    for (const s of ["SUBMITTED", "QUOTED", "PAYMENT_HELD", "ASSIGNED", "IN_PROGRESS", "QC_REVIEW"]) {
      expect(statusKind(s)).toBe("active");
    }
  });
  it("is done once approved", () => {
    for (const s of ["APPROVED", "DELIVERED", "CLOSED", "PAYOUT_RELEASED"]) expect(statusKind(s)).toBe("done");
  });
  it("is muted for drafts and orders that ended without landing", () => {
    for (const s of ["DRAFT", "REFUNDED", "CANCELLED", "SOMETHING_NEW"]) expect(statusKind(s)).toBe("muted");
  });
});
