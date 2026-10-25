import { expect, test, type Page } from "@playwright/test";

import { withDb } from "./db";
import { png } from "./files";
import { act, expectGone, orderIdFrom, refused, setSetting, settled, signedIn } from "./helpers";
import { PERSONAS, readState } from "./state";

/**
 * Phase 8b — an order taken by WhatsApp and entered by the admin
 * (Spec §12.6), then assigned over capacity (Spec §12.4):
 *
 *   no screenshot → refused; with one → the client sees the order; the
 *   clock starts only once it is paid (and confirmed); with capacity
 *   blocking on, one minute over the shift is refused to the pod lead and
 *   allowed to an admin who gives a reason.
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

const state = readState();
const client2 = state.users.client2;
let orderId = "";

const ordersOf = (clientId: string) =>
  withDb(async (db) => Number((await db.query("SELECT count(*) FROM orders WHERE client_id = $1", [clientId])).rows[0].count));
const clock = (id: string) =>
  withDb(
    async (db) =>
      (
        await db.query(
          `SELECT sla_started_at, sla_due_at, paid_at, confirmed_at,
                  extract(epoch FROM sla_due_at - sla_started_at)::int AS seconds
           FROM orders WHERE id = $1`,
          [id],
        )
      ).rows[0] as { sla_started_at: Date | null; sla_due_at: Date | null; paid_at: Date | null; confirmed_at: Date | null; seconds: number | null },
  );

/** The form's file input, in its visible "Screenshots" section. */
const screenshots = (page: Page) => page.getByRole("group", { name: /Screenshots of the request/ }).locator('input[type="file"]');

async function fillOrder(page: Page) {
  await page.goto(`/admin/new-order?q=${encodeURIComponent(PERSONAS.client2.business)}`);
  // While the page streams in, a hidden second copy of the form can sit in
  // the document for a moment (seen on CI): wait until one is left, then use
  // role locators, which see only the visible form.
  await expect(page.locator('select[name="source"]')).toHaveCount(1);
  await expect(page.getByRole("radio").first()).toBeChecked();
  const order = page.getByRole("group", { name: /The order/ });
  await order.getByLabel("Came by").selectOption("whatsapp");
  await order.getByLabel(/What they asked for/).fill("Halo ring like the photo, 18K yellow, size US 6.");
  // No email from the tests.
  await page.getByRole("checkbox", { name: /Email the client that the order is placed/ }).uncheck();
}

test("an on-behalf order without a screenshot is refused; with one, the client sees it", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");
  const before = await ordersOf(client2);

  // The browser asks for a file first; the server must refuse on its own.
  await fillOrder(admin);
  await screenshots(admin).evaluate((el) => el.removeAttribute("required"));
  await refused(admin, admin.getByRole("button", { name: "Place order" }));
  expect(await ordersOf(client2), "an order was made without a screenshot").toBe(before);

  await fillOrder(admin);
  await screenshots(admin).setInputFiles({ name: "whatsapp.png", mimeType: "image/png", buffer: png([40, 160, 90], 40) });
  await act(admin, admin.getByRole("button", { name: "Place order" }));
  await admin.waitForURL(/\/orders\/[^/?#]+$/);
  orderId = orderIdFrom(admin.url());
  expect(await ordersOf(client2)).toBe(before + 1);

  // Received, not paid: no clock.
  expect((await clock(orderId)).sla_due_at).toBeNull();
  await admin.context().close();

  const client = await signedIn(browser, "client2");
  await client.goto("/orders");
  // A phone list and a desk table: the visible one at this width.
  await expect(client.locator(`a[href^="/orders/${orderId}"]`).filter({ visible: true }).first()).toBeVisible();
  await client.goto(`/orders/${orderId}`);
  await expect(client.getByText("Halo ring like the photo", { exact: false }).first()).toBeVisible();
  await client.context().close();
});

test("the clock starts only when the order is paid", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");
  await admin.goto(`/orders/${orderId}`);
  await act(admin, admin.getByRole("button", { name: "Set quote" }));
  await settled(admin, "quoted", (timeout) => expect(admin.getByRole("button", { name: "Mark paid" })).toBeVisible({ timeout }));
  expect((await clock(orderId)).sla_due_at, "the clock started before payment").toBeNull();

  await act(admin, admin.getByRole("button", { name: "Mark paid" }));
  await expectGone(admin, admin.getByRole("button", { name: "Mark paid" }));
  const confirm = admin.getByRole("button", { name: "Confirm order" });
  if (await confirm.count()) {
    await act(admin, confirm);
    await expectGone(admin, confirm);
  }
  const c = await clock(orderId);
  expect(c.paid_at).not.toBeNull();
  // From payment (or the confirmation, if later), 6 hours.
  expect(c.sla_started_at!.getTime()).toBe(Math.max(c.paid_at!.getTime(), c.confirmed_at!.getTime()));
  expect(c.seconds).toBe(6 * 3600);
  await admin.context().close();
});

test("one minute over the shift is refused to the pod lead, allowed to an admin with a reason", async ({ browser }) => {
  // The designer's open minutes plus this job, less one: the job's last
  // minute is one past the shift (Spec §12.4's 481st minute).
  const shift = await withDb(async (db) => {
    const r = await db.query(
      `SELECT app.designer_open_minutes($1, $2) + c.minutes - 1 AS shift
       FROM orders o JOIN job_categories c ON c.letter = o.category WHERE o.id = $2`,
      [state.users.designer, orderId],
    );
    return String(r.rows[0].shift);
  });

  const admin = await signedIn(browser, "admin");
  await admin.goto("/admin/settings");
  const flag = admin.getByRole("button", { name: "Turn on capacity_blocking" });
  await act(admin, flag);
  await settled(admin, "capacity blocking on", (timeout) =>
    expect(admin.getByRole("button", { name: "Turn off capacity_blocking" })).toBeVisible({ timeout }),
  );
  await setSetting(admin, "shift_minutes", shift);
  try {
    const lead = await signedIn(browser, "podLead");
    await lead.goto(`/orders/${orderId}`);
    await refused(lead, lead.getByRole("button", { name: "Assign", exact: true }));
    await lead.context().close();

    await admin.goto(`/orders/${orderId}`);
    await admin.getByLabel("Over-capacity reason (admin)").fill("Rush for a regular client; Rohan agreed to stay late.");
    const assign = admin.getByRole("button", { name: "Assign", exact: true });
    await act(admin, assign);
    await expectGone(admin, assign);
    const reason = await withDb(async (db) => (await db.query("SELECT override_reason FROM job_assignments WHERE order_id = $1", [orderId])).rows[0]?.override_reason);
    expect(reason).toMatch(/Rush for a regular client/);
  } finally {
    await setSetting(admin, "shift_minutes", "480");
    await admin.goto("/admin/settings");
    const off = admin.getByRole("button", { name: "Turn off capacity_blocking" });
    if (await off.count()) await act(admin, off);
  }
  await admin.context().close();
});
