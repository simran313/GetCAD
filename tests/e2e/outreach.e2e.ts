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

test("an admin sets up a sender, imports a list, sends from Today and records the reply", async ({ browser }) => {
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

  // Today offers the new contact; the right template is filled in and opens in Gmail from the sender.
  await admin.goto("/admin/outreach/today");
  const item = admin.locator("li", { hasText: `Bright Bridal ${tag}` });
  await item.locator("summary").click();
  const message = item.getByLabel("Message");
  await expect(message).toHaveValue(/^Hi Ana,/);
  await expect(item.getByText(/Replace before sending/)).toBeVisible();
  await message.fill("Hi Ana, I saw your halo ring last week. We are a CAD studio for jewelers, from $35. Want to try one?");
  await expect(item.getByText(/Replace before sending/)).toHaveCount(0);
  const gmail = item.getByRole("link", { name: `Open in Gmail (cold-${tag}@example-cad.com)` });
  await expect(gmail).toHaveAttribute("href", new RegExp(`su=CAD\\+for\\+Bright\\+Bridal\\+${tag}`));
  await expect(gmail).toHaveAttribute("href", new RegExp(`authuser=cold-${tag}%40example-cad\\.com`));
  await act(admin, item.getByRole("button", { name: "Mark as sent" }));

  const sent = await withDb(
    async (db) =>
      (
        await db.query(
          `SELECT c.stage, c.touches, a.step, a.template_id IS NOT NULL AS templated,
                  round(extract(epoch FROM c.next_follow_up_at - now()) / 86400) AS days
             FROM outreach_contacts c JOIN outreach_activities a ON a.contact_id = c.id AND a.kind = 'SENT'
            WHERE c.id = $1`,
          [row.id],
        )
      ).rows[0],
  );
  expect(sent).toMatchObject({ stage: "CONTACTED", touches: 1, step: 1, templated: true });
  expect(Number(sent.days)).toBe(3);

  // Their reply, recorded on the contact page.
  await admin.goto(`/admin/outreach/${row.id}`);
  await expect(admin.getByRole("heading", { name: `Bright Bridal ${tag}` })).toBeVisible();
  await admin.getByRole("radio", { name: "They replied" }).click();
  await admin.getByLabel("What was said").fill("Wants a price for a halo");
  await act(admin, admin.getByRole("button", { name: "Save", exact: true }).first());
  await settled(admin, "reply recorded", (timeout) => expect(admin.getByText("Wants a price for a halo")).toBeVisible({ timeout }));
  const after = await withDb(async (db) => (await db.query("SELECT stage, touches FROM outreach_contacts WHERE id = $1", [row.id])).rows[0]);
  expect(after).toEqual({ stage: "REPLIED", touches: 1 });

  await admin.goto("/admin/outreach");
  await expect(admin.getByRole("heading", { name: "Outreach" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Last 14 days" })).toBeVisible();
  await expect(admin.getByLabel(/: \d+ sent, 1 reply$/).last()).toBeVisible();
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

test("an admin researches an area: searches open in new tabs, prospects are captured with a detail and fit, repeats are caught", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");
  const city = `Testville ${tag}`;

  await admin.goto("/admin/outreach/research");
  await admin.getByLabel("City").fill(city);
  await admin.getByLabel("State or region").fill("TX");
  await act(admin, admin.getByRole("button", { name: "Add and start researching" }));
  await expect(admin.getByText(`Retail or custom jeweler · ${city}, TX`)).toBeVisible({ timeout: 15_000 });

  const maps = admin.getByRole("link", { name: new RegExp(`^Google Maps custom jeweler near ${city}, TX$`) });
  await expect(maps).toHaveAttribute("target", "_blank");
  await expect(maps).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/search\//);

  const email = `owner-${tag}@research.example.com`;
  await admin.getByLabel("Business name").fill(`Found Jewelers ${tag}`);
  await admin.getByLabel("Website").fill(`https://www.found-${tag}.example.com/rings`);
  await admin.getByLabel("Email").fill(email);
  await admin.getByLabel("A real detail").fill("the oval halo you posted on Tuesday");
  await admin.getByRole("button", { name: "A: Strong fit" }).click();
  await act(admin, admin.getByRole("button", { name: "Save and next" }));
  await expect(admin.getByRole("link", { name: `Found Jewelers ${tag}` })).toBeVisible();

  const found = await withDb(
    async (db) =>
      (await db.query("SELECT kind, fit, detail, area_id IS NOT NULL AS in_area, segment, city FROM outreach_contacts WHERE email = $1", [email])).rows[0],
  );
  expect(found).toEqual({ kind: "PROSPECT", fit: "A", detail: "the oval halo you posted on Tuesday", in_area: true, segment: "RETAIL_JEWELER", city });

  // The same business again, by its website: flagged before any time goes on it.
  await admin.getByLabel("Website").fill(`found-${tag}.example.com`);
  await admin.getByLabel("Business name").focus();
  await expect(admin.getByText("Already in outreach (same website). Skip it and move on.")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Save and next" })).toBeDisabled();
  await admin.context().close();
});
