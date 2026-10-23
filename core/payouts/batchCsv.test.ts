import { describe, expect, it } from "vitest";

import { csvCell, paiseToRupees, payoutBatchCsv, type PayoutBatchRow } from "./batchCsv";

const row = (over: Partial<PayoutBatchRow> = {}): PayoutBatchRow => ({
  obligation_id: "ob1",
  order_ref: "MJ1-RN-C-1",
  party: "DESIGNER",
  beneficiary_name: "Dana Designer",
  account_number: "123456789012",
  ifsc: "HDFC0001234",
  account_type: "SAVINGS",
  bank_status: "VERIFIED",
  amount_paise: 140000,
  ...over,
});

describe("payout batch CSV", () => {
  it("rupees come from integer paise, two decimals", () => {
    expect(paiseToRupees(140000)).toBe("1400.00");
    expect(paiseToRupees(50005)).toBe("500.05");
    expect(paiseToRupees(0)).toBe("0.00");
    expect(() => paiseToRupees(1.5)).toThrow();
    expect(() => paiseToRupees(-1)).toThrow();
  });

  it("one header line and one line per row, account numbers kept as text", () => {
    const csv = payoutBatchCsv("PB-1", [row(), row({ obligation_id: "ob2", party: "QC", amount_paise: 90000 })]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"amount_inr"');
    expect(lines[1]).toBe(
      '"PB-1","Dana Designer","123456789012","HDFC0001234","SAVINGS","1400.00","MJ1-RN-C-1","Designer","VERIFIED","ob1"',
    );
    expect(lines[2]).toContain('"QC"');
    expect(lines[2]).toContain('"900.00"');
  });

  it("neutralises spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+91")).toBe(`"'+91"`);
    expect(csvCell("@sum")).toBe(`"'@sum"`);
    expect(csvCell(null)).toBe('""');
    const csv = payoutBatchCsv("PB-1", [row({ beneficiary_name: "-cmd" })]);
    expect(csv).toContain(`"'-cmd"`);
  });
});
