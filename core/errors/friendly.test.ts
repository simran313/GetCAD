import { describe, expect, it } from "vitest";

import { friendlyReason } from "./friendly";

describe("friendlyReason (Phase 16)", () => {
  it("rewords the rules a client meets", () => {
    expect(friendlyReason("the brief still needs: metal, size")).toBe("The brief still needs: metal, size. Add it, then send the brief");
    expect(friendlyReason("the brief is fixed once the order has been quoted (order is QUOTED)")).toMatch(/can't be changed once the order is quoted/);
    expect(friendlyReason("a revision can be asked for on a preview only (is IN_PROGRESS)")).toBe("You can ask for changes once the design is ready to preview");
    expect(friendlyReason("the 2 included revision rounds are used or the 14 day window has closed: order the change as a new order")).toBe(
      "The 2 included revision rounds are used, or the 14-day window has closed. Order the change as a new order",
    );
    expect(friendlyReason("order is not awaiting payment (is PAYMENT_HELD)")).toBe("This order isn't waiting for payment: it is paid");
    expect(friendlyReason("claims can be opened within 30 days of delivery, one at a time")).toBe("A claim can be opened within 30 days of delivery, one at a time");
  });

  it("rewords files and access for everyone", () => {
    expect(friendlyReason("rejected by sanitization gate: content type not allowed: application/x-msdownload")).toMatch(/^This kind of file can't be sent here/);
    expect(friendlyReason("rejected by sanitization gate: file too large (> 26214400 bytes)")).toBe("This file is larger than 25 MB");
    expect(friendlyReason("not authenticated")).toBe("You are signed out. Sign in again and retry");
    expect(friendlyReason("thread not found")).toBe("This is no longer available to you, or it was removed");
  });

  it("names statuses in anything it does not know, and never drops the reason", () => {
    expect(friendlyReason("can only quote a SUBMITTED order (is QUOTED)")).toBe("can only quote a submitted order (now quoted)");
    expect(friendlyReason("illegal transition: QUOTED -> ASSIGNED by role SALES")).toBe("That step isn't possible while the order is quoted");
    expect(friendlyReason("add at least one screenshot of the request")).toBe("add at least one screenshot of the request");
    // Codes that are not statuses stay as they are.
    expect(friendlyReason("only FINANCE may refund")).toBe("only FINANCE may refund");
  });
});
