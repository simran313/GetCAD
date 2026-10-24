import { describe, expect, it } from "vitest";

import { CLIENT_STEPS, clientNextStep, clientStepsDone, clientTab } from "./clientView";

describe("clientTab (C3 tabs)", () => {
  it("puts paying and reviewing under Needs you", () => {
    expect(clientTab("QUOTED")).toBe("needs");
    expect(clientTab("CLIENT_PREVIEW")).toBe("needs");
  });
  it("sorts the rest", () => {
    expect(clientTab("IN_PROGRESS")).toBe("progress");
    expect(clientTab("QC_REVIEW")).toBe("progress");
    expect(clientTab("REVISION_REQUESTED")).toBe("reopened");
    expect(clientTab("DELIVERED")).toBe("completed");
    expect(clientTab("REFUNDED")).toBe("cancelled");
  });
});

describe("clientNextStep (C1, C4)", () => {
  it("sends a quoted order to Pay and a preview to Review", () => {
    expect(clientNextStep("o1", "QUOTED")).toEqual({ headline: "Pay to start", action: "Pay", href: "/orders/o1/pay" });
    expect(clientNextStep("o1", "CLIENT_PREVIEW").href).toBe("/orders/o1/review");
  });
  it("sends finished orders to Files and drafts back to the brief", () => {
    expect(clientNextStep("o1", "APPROVED").href).toBe("/files");
    expect(clientNextStep("o1", "DRAFT").href).toBe("/orders/o1/brief");
  });
});

describe("clientStepsDone (C4 journey)", () => {
  it("walks the seven steps in order", () => {
    expect(CLIENT_STEPS).toHaveLength(7);
    const path = ["DRAFT", "SUBMITTED", "QUOTED", "PAYMENT_HELD", "QC_REVIEW", "CLIENT_PREVIEW", "APPROVED", "DELIVERED"];
    const done = path.map(clientStepsDone);
    expect(done).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
