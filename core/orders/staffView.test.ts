import { describe, expect, it } from "vitest";

import { queueRank, staffNext, staffStage, STAFF_STAGES } from "./staffView";

const base = { podId: "pod", confirmed: true, category: "C" };

describe("staffNext", () => {
  it("walks a paid order through pod, confirmation and assignment", () => {
    expect(staffNext({ ...base, status: "PAYMENT_HELD", podId: null }).action).toBe("Choose a pod");
    expect(staffNext({ ...base, status: "PAYMENT_HELD", confirmed: false }).action).toBe("Confirm");
    expect(staffNext({ ...base, status: "PAYMENT_HELD" }).action).toBe("Assign");
  });

  it("says why, with the source of a team-placed order and the dispute reason", () => {
    expect(staffNext({ ...base, status: "SUBMITTED", category: null, source: "whatsapp" }).why).toBe("Via WhatsApp · set category and price");
    expect(staffNext({ ...base, status: "DISPUTED", disputeReason: "Lug width off by 1 mm" })).toEqual({
      stage: "dispute",
      why: "Lug width off by 1 mm",
      action: "Resolve",
    });
    expect(staffNext({ ...base, status: "APPROVED" }).action).toBe("Deliver");
    expect(staffNext({ ...base, status: "CLOSED" }).action).toBe("Release");
  });

  it("queues only the stages where the team moves next", () => {
    expect(STAFF_STAGES).not.toContain(staffStage("IN_PROGRESS"));
    expect(STAFF_STAGES).not.toContain(staffStage("CLIENT_PREVIEW"));
    expect(STAFF_STAGES).toContain(staffStage("SUBMITTED"));
  });
});

describe("queueRank", () => {
  it("puts disputes first, then the nearest deadline, then the oldest", () => {
    const rows = [
      { id: "late", stage: "quote" as const, due: null, created: "2026-11-01" },
      { id: "soon", stage: "assign" as const, due: "2026-11-02T10:00:00Z", created: "2026-11-02" },
      { id: "dispute", stage: "dispute" as const, due: null, created: "2026-11-03" },
      { id: "sooner", stage: "deliver" as const, due: "2026-11-02T08:00:00Z", created: "2026-11-02" },
    ];
    expect(rows.sort(queueRank).map((r) => r.id)).toEqual(["dispute", "sooner", "soon", "late"]);
  });
});
