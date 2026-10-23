/**
 * The bank-transfer file for one payout batch (DECISIONS §5, Phase 3b).
 *
 * In October payouts go out by bank transfer from this file
 * (in_app_payouts off). It is opened in a spreadsheet before upload, so a
 * cell that starts with = + - @ (or a tab / carriage return) would run as a
 * formula there; such cells are prefixed with an apostrophe. Amounts are
 * rupees with two decimals, from integer paise, so no float ever touches
 * money.
 */

export interface PayoutBatchRow {
  obligation_id: string;
  order_ref: string | null;
  party: string;
  beneficiary_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  account_type: string | null;
  bank_status: string | null;
  amount_paise: number;
}

export const PAYOUT_CSV_HEADER = [
  "batch",
  "beneficiary_name",
  "account_number",
  "ifsc",
  "account_type",
  "amount_inr",
  "order_ref",
  "role",
  "bank_status",
  "obligation_id",
] as const;

/** Integer paise as rupees with two decimals: 140000 → "1400.00". */
export function paiseToRupees(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new Error(`invalid paise amount: ${paise}`);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `${rupees}.${rest.toString().padStart(2, "0")}`;
}

/** One CSV cell: quoted, quotes doubled, formula triggers neutralised. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function payoutBatchCsv(batch: string, rows: PayoutBatchRow[]): string {
  const lines = [PAYOUT_CSV_HEADER.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        batch,
        r.beneficiary_name,
        r.account_number,
        r.ifsc,
        r.account_type,
        paiseToRupees(r.amount_paise),
        r.order_ref,
        r.party === "QC" ? "QC" : "Designer",
        r.bank_status,
        r.obligation_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
