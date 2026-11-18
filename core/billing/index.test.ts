import { describe, expect, it } from "vitest";

import { exportStatement, invoiceFileName, offeredMethods, paymentLine, placeOfSupply } from ".";

const tax = { sac: "998391", export: true, lut_arn: "AD070426000123X", lut_fy: "2026-27", title: "Tax invoice", note: null };

describe("invoice wording", () => {
  it("states an export under LUT with its reference, or plainly without one", () => {
    expect(exportStatement(tax)).toBe(
      "Supply meant for export under Letter of Undertaking without payment of integrated tax (IGST). LUT ARN AD070426000123X, FY 2026-27.",
    );
    expect(exportStatement({ ...tax, lut_arn: null })).toBe("Export of services.");
    expect(exportStatement({ ...tax, export: false })).toBeNull();
  });

  it("gives the place of supply", () => {
    expect(placeOfSupply({ tax, bill_to: { business: null, contact: null, email: null, address: null, country: "United States" } })).toBe(
      "Outside India (United States)",
    );
    expect(placeOfSupply({ tax: { ...tax, export: false }, bill_to: { business: null, contact: null, email: null, address: null, country: null } })).toBe(
      "India",
    );
  });

  it("says how it was paid", () => {
    expect(paymentLine("razorpay", "pay_123")).toBe("Paid in full by card (Razorpay) (ref pay_123).");
    expect(paymentLine("wise", null)).toBe("Paid in full by Wise transfer.");
    expect(paymentLine(null, null)).toBe("Paid in full.");
  });

  it("makes a safe file name", () => {
    expect(invoiceFileName("TCP/2026-27/0001")).toBe("Invoice-TCP-2026-27-0001.pdf");
  });
});

describe("other ways to pay", () => {
  it("offers only what finance filled in, in a fixed order", () => {
    expect(offeredMethods(null)).toEqual([]);
    expect(offeredMethods({ bank_transfer: " ", wise_details: "USD account", paypal_link: "https://paypal.me/x" }).map(([m]) => m)).toEqual([
      "WISE",
      "PAYPAL",
    ]);
  });
});
