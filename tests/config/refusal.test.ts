import { describe, expect, it } from "vitest";

import { actionErrorText, Refusal, refusalReason, refuseOn } from "../../lib/refusal";

/**
 * Phase 11c: a refusal carries its reason in its digest (the one part of a
 * server action's error that Next sends to the browser in production);
 * anything else stays a plain error with no reason to show.
 */
describe("refusals", () => {
  it("a rule the database refused on becomes a refusal with its reason", () => {
    let caught: unknown;
    try {
      refuseOn({ code: "P0001", message: "can only quote a SUBMITTED order (is QUOTED)" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Refusal);
    expect(refusalReason(caught)).toBe("Can only quote a submitted order (now quoted).");
  });

  it("other database errors stay plain errors, with nothing to show", () => {
    let caught: unknown;
    try {
      refuseOn({ code: "42501", message: "permission denied for table orders" });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(Refusal);
    expect(refusalReason(caught)).toBeNull();
    expect(() => refuseOn(null)).not.toThrow();
  });

  it("what the browser sees in production: only the digest survives", () => {
    // Next replaces the message and keeps the digest.
    const fromServer = Object.assign(new Error("An error occurred in the Server Components render. The specific message is omitted in production builds"), {
      digest: new Refusal("add at least one screenshot of the request").digest,
    });
    expect(actionErrorText(fromServer)).toBe("Add at least one screenshot of the request.");
    const fault = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "3163124972" });
    expect(actionErrorText(fault)).toBeNull();
    expect(actionErrorText(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("a sentence keeps its own ending", () => {
    expect(refusalReason(new Refusal("Too many requests from this network. Please try again later."))).toBe(
      "Too many requests from this network. Please try again later.",
    );
  });
});
