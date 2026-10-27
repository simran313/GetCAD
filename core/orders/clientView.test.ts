import { describe, expect, it } from "vitest";

import { CLIENT_STEPS, clientNextStep, clientStepsDone, clientTab, firstLookHours, whatYouGet } from "./clientView";

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

describe("clientNextStep (order hub)", () => {
  it("sends a quoted order to Pay with the price and the promise", () => {
    expect(clientNextStep("o1", "QUOTED", { price: "$85.00" })).toEqual({
      headline: "Your price is ready",
      detail: "$85.00 · first look within 6 h",
      action: "Pay & start",
      href: "/orders/o1/pay",
    });
    expect(clientNextStep("o1", "QUOTED", { price: "$300.00", tier: "complex", complexHours: 48 }).detail).toBe(
      "$300.00 · first look within 48 h",
    );
  });
  it("sends a preview to Review, and calls one after a round a new version", () => {
    expect(clientNextStep("o1", "CLIENT_PREVIEW").href).toBe("/orders/o1/review");
    expect(clientNextStep("o1", "CLIENT_PREVIEW").headline).toBe("Your design is ready");
    expect(clientNextStep("o1", "CLIENT_PREVIEW", { service: "render" }).headline).toBe("Your renders are ready");
    expect(clientNextStep("o1", "CLIENT_PREVIEW", { roundsUsed: 1 }).headline).toBe("A new version is ready");
  });
  it("offers no button while the team works, and says when the first look is due", () => {
    for (const s of ["SUBMITTED", "PAYMENT_HELD", "ASSIGNED", "IN_PROGRESS", "QC_REVIEW", "REVISION_REQUESTED", "CANCELLED"]) {
      expect(clientNextStep("o1", s).action, s).toBeNull();
    }
    expect(clientNextStep("o1", "IN_PROGRESS", { firstLookBy: "Tue, Oct 27, 3:00 PM" }).detail).toBe("First look by Tue, Oct 27, 3:00 PM");
  });
  it("sends finished orders to Files, drafts back to the brief and a problem to chat", () => {
    expect(clientNextStep("o1", "APPROVED").href).toBe("/files");
    expect(clientNextStep("o1", "DRAFT").href).toBe("/orders/o1/brief");
    expect(clientNextStep("o1", "DISPUTED").href).toBe("/messages/o1");
  });
});

describe("firstLookHours and whatYouGet", () => {
  it("promises 6 hours, or the complex deadline", () => {
    expect(firstLookHours("standard", null)).toBe(6);
    expect(firstLookHours("complex", 72)).toBe(72);
    expect(firstLookHours("complex", null)).toBeNull();
  });
  it("names what a render order gets", () => {
    expect(whatYouGet("render")).toMatch(/^Rendered views/);
    expect(whatYouGet("cad")).toMatch(/STL, 3DM/);
  });
});

describe("clientStepsDone (five stages)", () => {
  it("walks Brief → Quote → Design → Review → Delivered in order", () => {
    expect(CLIENT_STEPS).toEqual(["Brief", "Quote", "Design", "Review", "Delivered"]);
    const path = ["DRAFT", "QUOTED", "IN_PROGRESS", "CLIENT_PREVIEW", "APPROVED", "DELIVERED"];
    expect(path.map(clientStepsDone)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("keeps changes and problems in Design, and shows no journey for an ended order", () => {
    expect(clientStepsDone("REVISION_REQUESTED")).toBe(2);
    expect(clientStepsDone("DISPUTED")).toBe(2);
    expect(clientStepsDone("CANCELLED")).toBeNull();
    expect(clientStepsDone("REFUNDED")).toBeNull();
  });
});
