import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { asUser, withDb } from "../e2e/db";
import { threeDm } from "../e2e/files";
import { act, expectGone, passAll, settled, submitFormOf } from "../e2e/helpers";
import { pdfText } from "../e2e/pdf";
import { PERSONAS, readState, type Persona } from "../e2e/state";
import { chatPhoto, placeholderLogo, referencePhoto, renderImage, ringStl, techDrawing } from "./assets";

/**
 * Marketing screenshots (owner, 2 Nov 2026), on the throwaway e2e stack:
 * a demo jeweler, "[Your Jewelry Co.]", with real orders made through the
 * real screens — one delivered (AB1-RN-S-07), one ready for review, one in
 * progress with its first look due in about 5 h 42 m — then each screen at
 * 390 and 1440 into marketing-shots/, with the delivered order's documents
 * and the pillar mark. Every page and document is checked for test names.
 */
test.describe.configure({ mode: "serial", timeout: 1_800_000 });

const OUT = join(process.cwd(), "marketing-shots");
const WIDTHS = [
  [390, 844],
  [1440, 900],
] as const;
// Names the e2e suite uses; none may reach a marketing picture.
const BANNED = /meera|tara fine|tara iyer|\be2e\b|clerk_test|getcad\.dev|mehta|kapoor|iyer eternity|rohan designer|brief for the screens|\bMJ1\b/i;

const DEMO = {
  email: "demo-jeweler+clerk_test@getcad.dev",
  business: "[Your Jewelry Co.]",
  legalName: "[Your Name]",
  contact: "orders@example.com",
  phone: "+1 212 555 0147",
};
const REFS = { delivered: "AB1-RN-S-07", review: "AB1-RN-S-08", progress: "AB1-RN-S-09", pay: "AB1-RN-S-10" } as const;

const state = readState();
let demoId = "";
const orders = { delivered: "", review: "", progress: "", draft: "", pay: "" };
let previewPath = "";
const findings: string[] = [];

async function signedIn(browser: Browser, who: Persona | "demo"): Promise<Page> {
  const context = await browser.newContext({ timezoneId: "America/New_York", locale: "en-US", permissions: ["microphone"] });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[browser:${who}] ${e.message}`));
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: who === "demo" ? DEMO.email : PERSONAS[who].email });
  await page.goto("/home");
  await clerk.loaded({ page });
  return page;
}

async function check(where: string, text: string) {
  const m = text.match(BANNED);
  if (m) findings.push(`${where}: "${m[0]}"`);
}

/** One screen at phone and desk width: `name_390.png`, `name_1440.png`. */
async function shoot(page: Page, name: string, path: string, before?: (page: Page) => Promise<void>, fullPage = true) {
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    if (before) await before(page).catch((e) => console.log(`! ${name} @${width}: ${e}`));
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    // The window as tall as the page, so the sidebar and the phone's tab bar
    // sit where they belong instead of stopping at the first screen.
    if (fullPage) {
      const tall = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      if (tall > height) await page.setViewportSize({ width, height: Math.min(tall, 8000) });
    }
    await page.waitForTimeout(800);
    const file = join(OUT, `${name}_${width}.png`);
    await page.screenshot({ path: file, fullPage, animations: "disabled" });
    await check(`${name}_${width}.png`, `${await page.title()}\n${await page.locator("body").innerText().catch(() => "")}`);
    console.log(`${name} @${width} → ${page.url().replace(/^https?:\/\/[^/]+/, "")}`);
  }
}

const choose = (page: Page, legend: string, option: string) =>
  page.getByRole("group", { name: legend }).getByText(option, { exact: true }).first().click();

/** A new CAD brief, through the brief screens, up to the review step. Returns the order id. */
async function startBrief(page: Page, name: string, product = "Ring"): Promise<string> {
  await page.goto("/orders/new");
  await page.getByRole("button", { name: /^CAD design/ }).click();
  await page.waitForURL(/\/orders\/[^/]+\/brief$/);
  const id = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Add photos").setInputFiles({ name: "reference.jpg", mimeType: "image/jpeg", buffer: await referencePhoto() });
  await expect(page.getByRole("img", { name: /reference photo/i }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Name this job").fill(name);
  await choose(page, "What are we modelling?", product);
  return id;
}

async function fillRingBrief(page: Page, notes: string) {
  // A 6.5 mm round centre in four claws (best effort: the rest of the brief does not depend on it).
  try {
    await page.getByLabel("Centre stone", { exact: true }).check();
    await choose(page, "Shape", "Round");
    await page.getByLabel("Length (mm)", { exact: true }).first().fill("6.5");
    await page.getByLabel("Width (mm)", { exact: true }).first().fill("6.5");
    await choose(page, "Setting", "Prong 4");
  } catch (e) {
    console.log(`! centre stone: ${e}`);
  }
  await choose(page, "Stones supplied by", "Client");
  await page.getByLabel("Ring size", { exact: true }).fill("US 6.5");
  await choose(page, "Metal", "Yellow");
  await page.getByLabel("Karat", { exact: true }).fill("18K");
  await choose(page, "Made for", "Casting");
  await choose(page, "Files", "Both");
  await choose(page, "Finish", "High polish");
  await page.getByLabel("Notes").fill(notes).catch(() => {});
}

/** The client's two numbered pins on the brief's photo (what the pin sheet saves). */
async function pin(orderId: string) {
  await withDb(async (db) => {
    const img = (await db.query("SELECT id FROM order_reference_images WHERE order_id = $1 ORDER BY created_at LIMIT 1", [orderId])).rows[0]?.id;
    await asUser(db, demoId, "SELECT public.set_reference_pins($1, $2::int[], $3::int[], $4::text[])", [
      img,
      [5000, 7830],
      [2600, 6000],
      ["Centre stone: 6.5 mm round, four claws", "Keep the band this slim, about 2 mm"],
    ]);
  });
}

async function send(page: Page, orderId: string, ref: string) {
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.waitForURL(`**/orders/${orderId}/brief/review`);
  await page.getByRole("button", { name: "Send for a price" }).click();
  await page.waitForURL(`**/orders/${orderId}/sent`);
  // The reference the owner chose for the pictures (the app mints its own).
  await withDb((db) => db.query("UPDATE orders SET order_ref = $2, job_code = $3 WHERE id = $1", [orderId, ref, ref.slice(4)]));
}

async function brief(page: Page, name: string, ref: string, notes: string): Promise<string> {
  const id = await startBrief(page, name);
  await fillRingBrief(page, notes);
  await pin(id);
  await send(page, id, ref);
  return id;
}

async function quote(admin: Page, orderId: string, pay: boolean) {
  await admin.goto(`/orders/${orderId}`);
  await admin.locator('input[name="price_usd"]').fill("35");
  await act(admin, admin.getByRole("button", { name: "Set quote" }));
  await settled(admin, "quoted", (timeout) => expect(admin.getByRole("button", { name: "Mark paid" })).toBeVisible({ timeout }));
  if (!pay) return;
  await act(admin, admin.getByRole("button", { name: "Mark paid" }));
  await expectGone(admin, admin.getByRole("button", { name: "Mark paid" }));
  await act(admin, admin.getByRole("button", { name: "Confirm order" }));
  await expectGone(admin, admin.getByRole("button", { name: "Confirm order" }));
}

async function assign(lead: Page, orderId: string) {
  await lead.goto(`/orders/${orderId}`);
  await act(lead, lead.getByRole("button", { name: "Assign", exact: true }));
}

/** The designer's version: start, volume, the four files, the weights; then, if `submit`, the final review and Send to QC. */
async function designerVersion(page: Page, orderId: string, submit: boolean) {
  await page.goto(`/work/${orderId}`);
  const start = page.getByRole("button", { name: "Start work" });
  await settled(page, "Start work offered", (timeout) => expect(start).toBeVisible({ timeout }));
  await act(page, start);
  await expectGone(page, start);

  const volume = page.getByLabel("Model volume in cubic millimetres");
  await volume.fill("245.3");
  await submitFormOf(page, volume, "Save");
  await settled(page, "volume saved", (timeout) => expect(volume).toHaveValue("245.3", { timeout }));

  const files = {
    "3DM": { name: "halo-ring.3dm", mimeType: "application/octet-stream", buffer: await threeDm() },
    STL: { name: "halo-ring.stl", mimeType: "model/stl", buffer: ringStl() },
    RENDER: { name: "halo-ring-render.png", mimeType: "image/png", buffer: await renderImage() },
    TECH: { name: "halo-ring-technical.png", mimeType: "image/png", buffer: await techDrawing() },
  };
  for (const [code, file] of Object.entries(files)) {
    await page.getByLabel(`File for ${code}`, { exact: true }).setInputFiles(file);
    const row = page.locator("li", { has: page.getByLabel(`File for ${code}`, { exact: true }) });
    await settled(page, `${code} uploaded`, (timeout) => expect(row.getByRole("button", { name: "Replace" })).toBeVisible({ timeout }));
  }

  // Gold weight and the diamonds: a 1.00 ct centre and a halo of 16.
  await page.getByLabel("18K cast weight (g) · this job").fill("3.42");
  await page.getByRole("button", { name: "Add diamonds" }).click();
  const line = (n: number) => page.locator("li", { has: page.getByLabel(`Chart · line ${n}`) });
  try {
    await page.getByLabel("Chart · line 1").selectOption("centre");
    await line(1).getByLabel("Size (mm)").selectOption("6.5");
    await line(1).getByLabel("Pieces").fill("1");
    await page.getByRole("button", { name: "Add diamonds" }).click();
    // A new line starts as a copy of the last one: back to the side-stone chart.
    await page.getByLabel("Chart · line 2").selectOption("size");
    await line(2).getByLabel("Shape").selectOption("Round Brilliant");
    await line(2).getByLabel("Size (mm)").selectOption("1.3");
    await line(2).getByLabel("Pieces").fill("16");
  } catch (e) {
    console.log(`! diamond lines: ${e}`);
    await page.getByLabel("Pieces").last().fill("16");
  }
  await act(page, page.getByRole("button", { name: "Save weights" }));
  await settled(page, "weights joined", (timeout) => expect(page.getByText("Saved and added under the technical image.")).toBeVisible({ timeout }));
  if (!submit) return;

  await page.goto(`/work/${orderId}/review`);
  await settled(page, "3D view drawn", (timeout) => expect(page.locator('[data-state="ready"]')).toBeVisible({ timeout }));
  await passAll(page);
  await act(page, page.getByRole("button", { name: "Send to QC" }));
  await settled(page, "submitted to QC", (timeout) => expect(page.getByText(/With your pod lead for QC/)).toBeVisible({ timeout }));
}

async function qcPass(lead: Page, orderId: string) {
  await lead.goto(`/qc/${orderId}`);
  await passAll(lead);
  await lead.getByLabel("Minimum wall (mm)", { exact: true }).fill("0.9");
  await lead.getByLabel("Minimum prong (mm)", { exact: true }).fill("0.85");
  await lead.getByLabel("Ring size", { exact: true }).fill("US 6.5");
  await act(lead, lead.getByRole("button", { name: "Record measurements" }));
  await settled(lead, "measured", (timeout) => expect(lead.getByRole("button", { name: "Update measurements" })).toBeVisible({ timeout }));
  const pass = lead.getByRole("button", { name: "Approve · pass to client" });
  await act(lead, pass);
  await expectGone(lead, pass);
}

/** The in-progress order's first look: due in 5 h 42 m from now. */
const countdown = () =>
  withDb((db) =>
    db.query("UPDATE orders SET sla_due_at = now() + interval '5 hours 42 minutes 30 seconds', sla_status = 'running' WHERE id = $1", [orders.progress]),
  );

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const secretKey = (process.env.CLERK_SECRET_KEY ?? "").trim().replace(/^["']+|["']+$/g, "");
  const clerkApi = createClerkClient({ secretKey });
  const found = await clerkApi.users.getUserList({ emailAddress: [DEMO.email] });
  demoId = (found.data[0] ?? (await clerkApi.users.createUser({ emailAddress: [DEMO.email], firstName: "Jeweler", skipPasswordRequirement: true }))).id;
  await withDb(async (db) => {
    await db.query("INSERT INTO users (id, role, status) VALUES ($1, 'CLIENT', 'ACTIVE') ON CONFLICT (id) DO NOTHING", [demoId]);
    await asUser(db, demoId, "SELECT public.save_client_profile($1,$2,$3,$4)", [DEMO.business, DEMO.legalName, DEMO.contact, DEMO.phone]);
    await asUser(db, demoId, "SELECT public.save_attribution('google', '{}'::jsonb)");
    // Client code AB1, as in the reference the owner chose.
    await db.query("UPDATE client_accounts SET code_prefix = 'AB', code_n = 1 WHERE user_id = $1", [demoId]);
    // The test designer's legal name reads as a test; give it a real-looking one.
    await db.query("UPDATE designer_profiles SET legal_name = 'Rohan Mehra' WHERE user_id = $1", [state.users.designer]);
  });
});

test("seed: the demo jeweler's orders, through the real screens", async ({ browser }) => {
  const client = await signedIn(browser, "demo");
  const admin = await signedIn(browser, "admin");
  const lead = await signedIn(browser, "podLead");
  const designer = await signedIn(browser, "designer");

  orders.delivered = await brief(client, "Halo engagement ring", REFS.delivered, "Halo engagement ring in 18K yellow. 1.00 ct round centre (6.5 mm) in four claws, a halo of 16 × 1.3 mm, slim 2 mm band. Match the photo.");
  orders.review = await brief(client, "Three-stone engagement ring", REFS.review, "Three-stone ring: 1.00 ct round centre with two 0.30 ct side stones, 18K yellow, 2.2 mm band.");
  orders.progress = await brief(client, "Vintage milgrain band", REFS.progress, "Milgrain edges, hand-engraved look on the sides, 3 mm wide, 18K yellow.");

  for (const id of [orders.delivered, orders.review, orders.progress]) {
    await quote(admin, id, true);
    await assign(lead, id);
  }
  for (const id of [orders.delivered, orders.review]) {
    await designerVersion(designer, id, true);
    await qcPass(lead, id);
  }
  await designerVersion(designer, orders.progress, false);

  // The delivered order: approved, files released, a branded preview link.
  await client.goto(`/orders/${orders.delivered}/review`);
  await act(client, client.getByRole("button", { name: "Approve this design" }));
  await admin.goto(`/orders/${orders.delivered}`);
  const deliver = admin.getByRole("button", { name: "Delivered", exact: true });
  await act(admin, deliver);
  await expectGone(admin, deliver);

  await client.goto("/account");
  await client.getByLabel("Logo file").setInputFiles({ name: "your-logo.png", mimeType: "image/png", buffer: await placeholderLogo() });
  await act(client, client.getByRole("button", { name: "Upload" }));
  await settled(client, "logo saved", (timeout) => expect(client.getByAltText("Your logo")).toBeVisible({ timeout }));
  await client.goto(`/orders/${orders.delivered}`);
  await act(client, client.getByRole("button", { name: "Create link" }));
  previewPath = new URL(await client.getByLabel("Preview link").inputValue()).pathname;

  // The conversation: a marked-up photo, the team's answer, a voice note.
  await client.goto(`/messages/${orders.delivered}`);
  const composer = (p: Page) => p.locator("form", { has: p.getByRole("button", { name: "Attach" }) });
  await composer(client).locator("textarea").fill("Hi team, this is the ring my customer loved. Can we keep the halo this tight?");
  await composer(client).locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles({ name: "customer-photo.jpg", mimeType: "image/jpeg", buffer: await chatPhoto() });
  await client.getByRole("button", { name: "Mark up" }).first().click();
  const canvas = client.getByRole("dialog").locator("canvas");
  await expect(canvas).toBeVisible();
  const b = (await canvas.boundingBox())!;
  // A loop around the halo, then a pin on the centre stone.
  await client.mouse.move(b.x + b.width * 0.36, b.y + b.height * 0.27);
  await client.mouse.down();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    await client.mouse.move(b.x + b.width * (0.5 - 0.15 * Math.cos(a)), b.y + b.height * (0.27 - 0.1 * Math.sin(a)));
  }
  await client.mouse.up();
  await client.getByRole("dialog").getByRole("button", { name: "Pin" }).click();
  await client.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.26);
  await client.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(client.getByRole("dialog")).toBeHidden();
  await composer(client).getByRole("button", { name: "Send", exact: true }).click();
  await expect(client.getByRole("img", { name: "Sent" }).or(client.getByRole("img", { name: "Read" })).first())
    .toBeVisible({ timeout: 30_000 })
    .catch(() => console.log("! the photo message shows no sent mark"));
  await client.waitForTimeout(2_000);

  await admin.goto(`/messages/${orders.delivered}`);
  await admin.getByRole("tab", { name: "Client" }).click().catch(() => {});
  await composer(admin).locator("textarea").fill("Yes. Sixteen 1.3 mm stones keep it tight, exactly like your photo. Your files are ready under Files.");
  await composer(admin).getByRole("button", { name: "Send", exact: true }).click();
  await admin.waitForTimeout(3_000);

  await client.goto(`/messages/${orders.delivered}`);
  await client.getByRole("button", { name: "Record a voice message" }).click();
  await client.waitForTimeout(4_500);
  await client.getByRole("button", { name: "Send the voice message" }).click();
  await expect(client.getByLabel("Voice message").first()).toBeVisible({ timeout: 30_000 });

  for (const p of [client, admin, lead, designer]) await p.context().close();
});

test("screens: before the brief and pay orders exist", async ({ browser }) => {
  const client = await signedIn(browser, "demo");
  await countdown();
  await shoot(client, "client_home", "/home");
  await shoot(client, "client_orders_new", "/orders/new");
  await shoot(client, "client_order", `/orders/${orders.delivered}`);
  await shoot(client, "client_review", `/orders/${orders.review}/review`);
  await shoot(client, "client_files", "/files");
  await shoot(client, "client_chat", `/messages/${orders.delivered}`, async (p) => {
    await p.getByLabel("Voice message").first().waitFor({ timeout: 15_000 });
  });
  await countdown();
  await shoot(client, "client_order_in_progress", `/orders/${orders.progress}`);

  // The documents of the delivered order, and its technical image.
  const docs: [string, string][] = [
    ["certificate", `/api/orders/${orders.delivered}/certificate`],
    ["summary_sheet", `/api/orders/${orders.delivered}/summary`],
    ["weight_sheet", `/api/orders/${orders.delivered}/weight-sheet`],
  ];
  const admin = await signedIn(browser, "admin");
  for (const [name, url] of docs) {
    let res = await client.request.get(url);
    if (res.status() !== 200) res = await admin.request.get(url);
    expect(res.status(), `${name} download`).toBe(200);
    const body = Buffer.from(await res.body());
    writeFileSync(join(OUT, `${name}_${REFS.delivered}.pdf`), body);
    await check(`${name}_${REFS.delivered}.pdf`, await pdfText(body));
  }
  await client.goto("/files");
  // The delivered order's card (the in-progress order's rows are locked), its newest technical sheet.
  const card = client.locator("section, article, div").filter({ hasText: REFS.delivered }).filter({ has: client.getByText("Technical sheet") }).last();
  const href = await card.locator("li", { hasText: "Technical sheet" }).first().getByRole("link", { name: "Download" }).getAttribute("href");
  const tech = await client.request.get(href!);
  expect(tech.status(), "technical image download").toBe(200);
  const ext = (tech.headers()["content-type"] ?? "").includes("jpeg") ? "jpg" : "png";
  writeFileSync(join(OUT, `technical_image_${REFS.delivered}.${ext}`), Buffer.from(await tech.body()));
  await admin.context().close();
  await client.context().close();
});

test("screens: the public preview, the designer's final review, the website", async ({ browser }) => {
  const viewer = await (await browser.newContext({ timezoneId: "America/New_York", locale: "en-US" })).newPage();
  await shoot(viewer, "public_preview", previewPath, async (p) => {
    await p.locator('[data-state="ready"]').first().waitFor({ timeout: 30_000 }).catch(() => {});
  });
  // The homepage's sample order card is fixed copy with a test client's
  // code (MJ1-…); in the picture it shows the demo order's reference.
  const demoCard = async (p: Page) => {
    await p.evaluate((ref) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\bMJ1-[A-Z]+-[A-Z]+-\d+\b/.test(n.nodeValue ?? "")) n.nodeValue = (n.nodeValue ?? "").replace(/\bMJ1-[A-Z]+-[A-Z]+-\d+\b/g, ref);
    }, REFS.delivered);
  };
  await shoot(viewer, "marketing_home", "/", demoCard);
  await shoot(viewer, "marketing_home_hero", "/", demoCard, false);
  await viewer.context().close();

  const designer = await signedIn(browser, "designer");
  await shoot(designer, "designer_final_review", `/work/${orders.progress}/review`, async (p) => {
    await p.locator('[data-state="ready"]').first().waitFor({ timeout: 30_000 });
    await p.waitForTimeout(1_500);
  });
  await designer.context().close();
});

test("screens: the brief form and the pay page", async ({ browser }) => {
  const client = await signedIn(browser, "demo");
  const admin = await signedIn(browser, "admin");

  // A brief being written: the photo with two numbered pins.
  orders.draft = await startBrief(client, "Pear halo pendant", "Pendant");
  await client.getByLabel("Length (mm)", { exact: true }).last().fill("22").catch(() => {});
  await choose(client, "Metal", "Yellow").catch(() => {});
  await client.getByLabel("Karat", { exact: true }).fill("18K").catch(() => {});
  // The brief saves itself a moment after typing: let it, before the page is opened again.
  await client.waitForTimeout(2_500);
  await expect(client.getByLabel("Saving")).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
  await client.waitForTimeout(1_500);
  await pin(orders.draft);
  await shoot(client, "client_brief", `/orders/${orders.draft}/brief`);
  await shoot(client, "client_brief_pins", `/orders/${orders.draft}/brief`, async (p) => {
    await p.getByRole("button", { name: "2 marked" }).first().click();
    await p.getByRole("dialog").waitFor();
  });

  // A quoted order: the pay page.
  orders.pay = await brief(client, "Signet ring with engraving", REFS.pay, "Oval signet face 12 × 10 mm, monogram engraving, 18K yellow.");
  await quote(admin, orders.pay, false);
  await shoot(client, "client_pay", `/orders/${orders.pay}/pay`);

  await admin.context().close();
  await client.context().close();
});

test.afterAll(() => {
  writeFileSync(
    join(OUT, "CHECK.md"),
    `# Test-name check\n\n${findings.length === 0 ? "No test names in any screenshot or document." : findings.map((f) => `- ${f}`).join("\n")}\n`,
  );
  expect(findings, "test names in the marketing output").toEqual([]);
});
