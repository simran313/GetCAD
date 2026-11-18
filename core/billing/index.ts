/**
 * Billing (0072; DECISIONS 1.35): the words an invoice prints. The database
 * decides the number, the snapshot and whether a sale is an export; these
 * only turn that into sentences, the same on the PDF and on the screen.
 */

export interface InvoiceTax {
  sac: string | null;
  export: boolean;
  lut_arn: string | null;
  lut_fy: string | null;
  title: string;
  note: string | null;
}

export interface InvoiceData {
  number: string;
  fy: string;
  issued_at: string;
  paid_at: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_ref: string | null;
  description: string;
  order_id: string;
  bill_to: { business: string | null; contact: string | null; email: string | null; address: string | null; country: string | null };
  seller: { legal_name: string; cin: string | null; address: string; gstin: string | null };
  tax: InvoiceTax;
}

/** The export statement an export invoice must carry, or null for a domestic one. */
export function exportStatement(tax: InvoiceTax): string | null {
  if (!tax.export) return null;
  if (tax.lut_arn) {
    return `Supply meant for export under Letter of Undertaking without payment of integrated tax (IGST). LUT ARN ${tax.lut_arn}${tax.lut_fy ? `, FY ${tax.lut_fy}` : ""}.`;
  }
  return "Export of services.";
}

/** Where the service is supplied, as an invoice states it. */
export function placeOfSupply(d: Pick<InvoiceData, "bill_to" | "tax">): string {
  if (d.tax.export) return `Outside India${d.bill_to.country ? ` (${d.bill_to.country})` : ""}`;
  return d.bill_to.country ?? "India";
}

const METHODS: Record<string, string> = {
  razorpay: "card (Razorpay)",
  wise: "Wise transfer",
  bank: "bank transfer",
  paypal: "PayPal",
  manual: "bank or Wise transfer",
};

/** "Paid in full by Wise transfer (ref P-12345)." */
export function paymentLine(method: string | null, ref: string | null): string {
  const how = method ? (METHODS[method] ?? method.replace(/_/g, " ")) : null;
  return `Paid in full${how ? ` by ${how}` : ""}${ref ? ` (ref ${ref})` : ""}.`;
}

/** A file name that is safe everywhere: Invoice-TCP-2026-27-0001.pdf. */
export function invoiceFileName(number: string): string {
  return `Invoice-${number.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

/** The other ways to pay a client can choose, from what finance filled in. */
export const OFFLINE_METHODS = [
  ["BANK_TRANSFER", "Bank transfer", "bank_transfer"],
  ["WISE", "Wise", "wise_details"],
  ["PAYPAL", "PayPal", "paypal_link"],
] as const;

export type PaymentOptions = { bank_transfer: string | null; wise_details: string | null; paypal_link: string | null };

export function offeredMethods(o: PaymentOptions | null): (typeof OFFLINE_METHODS)[number][] {
  if (!o) return [];
  return OFFLINE_METHODS.filter(([, , key]) => Boolean(o[key]?.trim()));
}
