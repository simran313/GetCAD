import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * 0072 — billing (owner, 18 Nov 2026; DECISIONS 1.35): invoices numbered by
 * financial year with a snapshot of seller, buyer and export wording; other
 * ways to pay; a client's "I've paid" report. Example addresses only.
 */
let db: Client;
const admin = generateId();
const client = generateId();
const other = generateId();
const lead = generateId();

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    "INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'CLIENT','ACTIVE'), ($4,'QC','ACTIVE')",
    [admin, client, other, lead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    "INSERT INTO client_profiles (id, user_id, legal_name, email, business_name) VALUES ($1,$2,'Ana Lopez','ana@bright.example.com','Bright Bridal')",
    [generateId(), client],
  );
  await db.query(
    `INSERT INTO client_verifications (user_id, business_type, country, address, website, state)
     VALUES ($1,'RETAIL_JEWELER','United States','12 Main St, Austin, TX 78701','bright.example.com','APPROVED')`,
    [client],
  );
});
afterAll(async () => {
  if (db) await db.end();
});

async function as<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  await db.query("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}
const q = (sub: string, sql: string, params: unknown[] = []) => as(sub, () => db.query(sql, params));

async function quotedOrder(currency = "USD", price = 3500): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout, platform_commission)
     VALUES ($1,$2,'CAD_MODEL','QUOTED',$3,$4,$5,$6,$7)`,
    [id, client, currency, price, Math.round(price * 0.6), Math.round(price * 0.2), price - Math.round(price * 0.6) - Math.round(price * 0.2)],
  );
  return id;
}
const markPaid = (id: string, ref = "WISE-123") => q(admin, "SELECT public.mark_payment_received($1, 'manual', $2)", [id, ref]);

describe("financial year", () => {
  it("runs April to March, India time", async () => {
    const fy = async (at: string) => (await db.query("SELECT app.financial_year($1::timestamptz) AS f", [at])).rows[0].f;
    expect(await fy("2026-04-01T00:00:00+05:30")).toBe("2026-27");
    expect(await fy("2027-03-31T23:59:00+05:30")).toBe("2026-27");
    expect(await fy("2027-03-31T19:00:00Z")).toBe("2027-28"); // 00:30 on 1 April in India
    expect(await fy("2099-12-01T00:00:00Z")).toBe("2099-00");
  });
});

describe("billing settings", () => {
  it("start with the company's details, are read by finance only and checked on save", async () => {
    const s = (await q(admin, "SELECT public.billing_settings_get() AS s")).rows[0].s;
    expect(s).toMatchObject({ legal_name: "Ichizu Private Limited", cin: "U74101DL2026PTC471762", invoice_prefix: "TCP", sac_code: "998391", gstin: null });
    await expect(q(client, "SELECT public.billing_settings_get()")).rejects.toThrow(/only finance/);
    await expect(q(client, "SELECT public.billing_settings_save('{}'::jsonb)")).rejects.toThrow(/only an admin/);
    await expect(q(admin, `SELECT public.billing_settings_save('{"gstin":"12345"}'::jsonb)`)).rejects.toThrow(/GSTIN is not in the right format/);
    await expect(q(admin, `SELECT public.billing_settings_save('{"paypal_link":"paypal.me/x"}'::jsonb)`)).rejects.toThrow(/must start with https/);
    await q(
      admin,
      `SELECT public.billing_settings_save('{"gstin":"07abcde1234f1z5","lut_arn":"AD070426000123X","lut_fy":"2026-27",
        "bank_transfer":"Ichizu Private Limited, account 123, IFSC ABCD0000123","wise_details":"USD account via Wise: routing 000, account 111",
        "paypal_link":"https://www.paypal.com/paypalme/example"}'::jsonb)`,
    );
    expect((await q(admin, "SELECT public.billing_settings_get() AS s")).rows[0].s).toMatchObject({ gstin: "07ABCDE1234F1Z5", lut_fy: "2026-27" });
    await expect(q(admin, "SELECT * FROM billing_settings")).rejects.toThrow(/permission denied/);
  });

  it("show clients the other ways to pay", async () => {
    const o = (await q(client, "SELECT public.payment_options() AS o")).rows[0].o;
    expect(o).toEqual({
      bank_transfer: "Ichizu Private Limited, account 123, IFSC ABCD0000123",
      wise_details: "USD account via Wise: routing 000, account 111",
      paypal_link: "https://www.paypal.com/paypalme/example",
    });
  });
});

describe("a client paying outside the checkout", () => {
  it("reports it with a reference; finance is told and sees it on the order", async () => {
    const id = await quotedOrder();
    await expect(q(other, "SELECT public.report_offline_payment($1, 'WISE', 'X')", [id])).rejects.toThrow(/no such order/);
    await q(client, "SELECT public.report_offline_payment($1, 'WISE', 'P-12345', 'Sent from our US account')", [id]);
    const note = (await db.query("SELECT summary, order_id FROM notifications WHERE user_id = $1 AND kind = 'PAYMENT_REPORTED'", [admin])).rows[0];
    expect(note).toEqual({ summary: "Client says they paid by Wise (ref P-12345). Check and mark paid.", order_id: id });
    const reports = (await q(admin, "SELECT * FROM public.offline_payment_reports_for($1)", [id])).rows;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ method: "WISE", reference: "P-12345", note: "Sent from our US account" });
    await expect(q(lead, "SELECT * FROM public.offline_payment_reports_for($1)", [id])).rejects.toThrow(/only finance/);
    expect((await db.query("SELECT status FROM orders WHERE id = $1", [id])).rows[0].status).toBe("QUOTED");
  });

  it("cannot report on an order that is not waiting for payment", async () => {
    const id = await quotedOrder();
    await markPaid(id);
    await expect(q(client, "SELECT public.report_offline_payment($1, 'BANK_TRANSFER', NULL)", [id])).rejects.toThrow(/not waiting for payment/);
  });
});

describe("invoices", () => {
  let first: string;
  let second: string;

  it("are issued only once an order is paid, and only to its client or finance", async () => {
    first = await quotedOrder();
    await expect(q(client, "SELECT public.issue_invoice($1)", [first])).rejects.toThrow(/not paid yet/);
    await markPaid(first);
    await expect(q(other, "SELECT public.issue_invoice($1)", [first])).rejects.toThrow(/no such order/);
    await expect(q(lead, "SELECT public.issue_invoice($1)", [first])).rejects.toThrow(/no such order/);
    const a = (await q(client, "SELECT public.issue_invoice($1) AS id", [first])).rows[0].id;
    const b = (await q(admin, "SELECT public.issue_invoice($1) AS id", [first])).rows[0].id;
    expect(a).toBe(b);
  });

  it("are numbered in sequence within the financial year", async () => {
    second = await quotedOrder("USD", 1500);
    await markPaid(second);
    // The webhook path: service role only.
    await expect(q(client, "SELECT public.issue_invoice_for_payment($1)", [second])).rejects.toThrow(/permission denied/);
    await db.query("SELECT public.issue_invoice_for_payment($1)", [second]);
    const rows = (await db.query("SELECT number, fy, seq FROM invoices ORDER BY seq")).rows;
    const fy = rows[0].fy;
    expect(rows.map((r) => r.number)).toEqual([`TCP/${fy}/0001`, `TCP/${fy}/0002`, `TCP/${fy}/0003`].slice(0, rows.length));
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
  });

  it("print the seller, the buyer and the export wording, from a snapshot", async () => {
    const d = (await q(client, "SELECT public.invoice_data($1) AS d", [first])).rows[0].d;
    expect(d).toMatchObject({
      amount: 3500,
      currency: "USD",
      payment_method: "manual",
      payment_ref: "WISE-123",
      bill_to: { business: "Bright Bridal", contact: "Ana Lopez", email: "ana@bright.example.com", address: "12 Main St, Austin, TX 78701", country: "United States" },
      seller: { legal_name: "Ichizu Private Limited", cin: "U74101DL2026PTC471762", gstin: "07ABCDE1234F1Z5" },
      tax: { sac: "998391", export: true, lut_arn: "AD070426000123X", lut_fy: "2026-27", title: "Tax invoice" },
    });
    expect(d.description).toMatch(/^Jewelry CAD design service: /);
    expect(d.client_id).toBeUndefined();

    // A later change to the settings never alters an issued invoice.
    await q(admin, `SELECT public.billing_settings_save('{"gstin":"","lut_arn":""}'::jsonb)`);
    const again = (await q(client, "SELECT public.invoice_data($1) AS d", [first])).rows[0].d;
    expect(again.seller.gstin).toBe("07ABCDE1234F1Z5");
    expect(again.tax.title).toBe("Tax invoice");
  });

  it("are listed for their client and for finance, and closed to everyone else", async () => {
    const mine = (await q(client, "SELECT * FROM public.my_invoices()")).rows;
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect((await q(other, "SELECT * FROM public.my_invoices()")).rows).toEqual([]);
    const all = (await q(admin, "SELECT * FROM public.admin_invoices()")).rows;
    expect(all[0]).toMatchObject({ business: "Bright Bridal", export: true });
    await expect(q(client, "SELECT * FROM public.admin_invoices()")).rejects.toThrow(/only finance/);
    await expect(q(other, "SELECT public.invoice_data($1)", [first])).rejects.toThrow(/no such order/);
    await expect(q(client, "SELECT * FROM invoices")).rejects.toThrow(/permission denied/);
  });

  it("for an Indian client in rupees are not exports", async () => {
    await db.query("UPDATE client_verifications SET country = 'India' WHERE user_id = $1", [client]);
    const id = await quotedOrder("INR", 290000);
    await markPaid(id);
    await q(client, "SELECT public.issue_invoice($1)", [id]);
    const d = (await q(admin, "SELECT public.invoice_data($1) AS d", [id])).rows[0].d;
    expect(d.tax).toMatchObject({ export: false, lut_arn: null, title: "Invoice" });
    await db.query("UPDATE client_verifications SET country = 'United States' WHERE user_id = $1", [client]);
  });
});
