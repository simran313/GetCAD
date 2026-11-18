import { expect, test } from "@playwright/test";

import { submittedBrief, withDb } from "./db";
import { act, expectGone, settled, signedIn } from "./helpers";
import { readState } from "./state";

/**
 * Billing (0072; DECISIONS 1.35): finance sets up Wise details; the client
 * sees them on the pay page and says they paid; finance sees that beside
 * Mark paid and marks it; the invoice is issued at once and downloads as a
 * PDF for the client. Example details only.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

const state = readState();
const client2 = state.users.client2;
const tag = Math.random().toString(36).slice(2, 7);

test("a client pays by Wise, finance marks it paid, and the invoice downloads", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");

  // Finance fills in the Wise details once.
  await admin.goto("/admin/billing/details");
  await admin.getByLabel("Wise (USD account details)").fill(`Example LLC · ACH routing 000000000 · account ${tag}`);
  await act(admin, admin.getByRole("button", { name: "Save billing details" }));
  await expect(admin.getByLabel("Wise (USD account details)")).toHaveValue(new RegExp(tag));

  // An order, quoted at the band price.
  const orderId = await withDb((db) => submittedBrief(db, client2, `E2E invoice ring ${tag}`));
  await admin.goto(`/orders/${orderId}`);
  await admin.locator('select[name="category"]').selectOption("C");
  await act(admin, admin.getByRole("button", { name: "Set quote" }));
  await settled(admin, "quoted", (timeout) => expect(admin.getByRole("button", { name: "Mark paid" })).toBeVisible({ timeout }));

  // The client sees the Wise details and says they paid.
  const client = await signedIn(browser, "client2");
  await client.goto(`/orders/${orderId}/pay`);
  await expect(client.getByText(new RegExp(`account ${tag}`))).toBeVisible();
  await client.getByLabel("Transfer reference").fill(`E2E-${tag}`);
  await act(client, client.getByRole("button", { name: "I've paid" }));
  await expect(client.getByText(/We will confirm as soon as the money arrives/)).toBeVisible();

  // Finance sees it beside Mark paid, and marks it with the same reference.
  await admin.goto(`/orders/${orderId}`);
  await expect(admin.getByText("The client says they paid by Wise").first()).toBeVisible();
  await admin.locator('input[name="reference"]').first().fill(`E2E-${tag}`);
  await act(admin, admin.getByRole("button", { name: "Mark paid" }).first());
  await expectGone(admin, admin.getByRole("button", { name: "Mark paid" }));

  const invoice = await withDb(
    async (db) => (await db.query("SELECT number, payment_ref FROM invoices WHERE order_id = $1", [orderId])).rows[0],
  );
  expect(invoice.payment_ref).toBe(`E2E-${tag}`);
  expect(invoice.number).toMatch(/^TCP\/\d{4}-\d{2}\/\d{4}$/);

  // The client downloads it.
  const res = await client.request.get(`/api/invoices/${orderId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain(`Invoice-${invoice.number.replace(/\//g, "-")}.pdf`);
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");

  await client.goto("/wallet/invoices");
  await expect(client.getByRole("link", { name: /^Download invoice for / }).first()).toBeVisible();

  // Nobody else gets it.
  const other = await signedIn(browser, "client");
  expect((await other.request.get(`/api/invoices/${orderId}`)).status()).toBe(404);

  await other.context().close();
  await client.context().close();
  await admin.context().close();
});
