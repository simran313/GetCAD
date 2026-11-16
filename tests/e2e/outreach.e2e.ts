import { expect, test } from "@playwright/test";

import { withDb } from "./db";
import { act, settled, signedIn } from "./helpers";

/**
 * Outreach (0069): an admin sets up a sender, imports a list with the columns
 * guessed from its headings, opens a contact and records a send; the
 * dashboard counts it. Example addresses only.
 */
const tag = Math.random().toString(36).slice(2, 7);
const csv = [
  "Company,Contact Person,E-mail,City,State,Type",
  `Bright Bridal ${tag},Ana,ana-${tag}@bright.example.com,Austin,TX,Bridal jeweler`,
  `Cast House ${tag},,orders-${tag}@cast.example.com,Providence,RI,Casting factory`,
  `Cast House again ${tag},,ORDERS-${tag}@cast.example.com,,,`,
].join("\n");

test("an admin sets up a sender, imports a list and records a send", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");

  await admin.goto("/admin/outreach/senders");
  await admin.getByLabel("Name").fill(`Cold ${tag}`);
  await admin.getByLabel("Address").fill(`cold-${tag}@example-cad.com`);
  await admin.getByLabel("Writes to").selectOption("PROSPECT");
  await act(admin, admin.getByRole("button", { name: "Add sender" }));
  await settled(admin, "sender added", (timeout) => expect(admin.getByText(`cold-${tag}@example-cad.com`)).toBeVisible({ timeout }));

  await admin.goto("/admin/outreach/import");
  await admin.getByText("Prospects (found by research)").click();
  await admin.getByLabel("File").setInputFiles({ name: "prospects.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(admin.getByLabel("Field for column 1")).toHaveValue("business_name");
  await expect(admin.getByLabel("Field for column 3")).toHaveValue("email");
  await admin.getByLabel("Send from").selectOption({ label: `Only Cold ${tag} (cold-${tag}@example-cad.com)` });
  await admin.getByRole("button", { name: "Import 3 contacts" }).click();
  await expect(admin.getByRole("heading", { name: "Imported 2 of 3" })).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByText("1 already in outreach")).toBeVisible();

  const row = await withDb(
    async (db) => (await db.query("SELECT id, segment, sender_id IS NOT NULL AS has_sender FROM outreach_contacts WHERE email = $1", [`ana-${tag}@bright.example.com`])).rows[0],
  );
  expect(row).toMatchObject({ segment: "RETAIL_JEWELER", has_sender: true });

  await admin.goto(`/admin/outreach/${row.id}`);
  await expect(admin.getByRole("heading", { name: `Bright Bridal ${tag}` })).toBeVisible();
  const gmail = admin.getByRole("link", { name: `Gmail from cold-${tag}@example-cad.com` });
  await expect(gmail).toHaveAttribute("href", new RegExp(`authuser=cold-${tag}%40example-cad\\.com`));
  await admin.getByRole("radio", { name: "I wrote to them" }).click();
  await admin.getByLabel("What was said").fill("Intro email with the $35 first design");
  await act(admin, admin.getByRole("button", { name: "Save", exact: true }).first());
  await settled(admin, "send recorded", (timeout) => expect(admin.getByText("Intro email with the $35 first design")).toBeVisible({ timeout }));

  const after = await withDb(async (db) => (await db.query("SELECT stage, touches FROM outreach_contacts WHERE id = $1", [row.id])).rows[0]);
  expect(after).toEqual({ stage: "CONTACTED", touches: 1 });

  await admin.goto("/admin/outreach");
  await expect(admin.getByRole("heading", { name: "Outreach" })).toBeVisible();
  await expect(admin.getByRole("link", { name: `Cold ${tag}` })).toBeVisible();
  await admin.context().close();
});

test("a client never reaches outreach", async ({ browser }) => {
  const client = await signedIn(browser, "client");
  await client.goto("/admin/outreach");
  // The database refuses; the page says so and shows no contact or sender.
  await expect(client.getByText(/Bright Bridal|Cast House/)).toHaveCount(0);
  await expect(client.getByRole("link", { name: /^Cold / })).toHaveCount(0);
  await expect(client.getByRole("table")).toHaveCount(0);
  await client.context().close();
});
