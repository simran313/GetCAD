import { expect, test, type Page } from "@playwright/test";

import { png } from "./files";
import { act, doDesignerVersion, expectGone, settled, orderIdFrom, signedIn, tickAll } from "./helpers";

/**
 * Phase 8a — the core journey, every step through the real screens:
 *
 *   client brief → admin quote, payment, confirm → pod lead assigns →
 *   designer works v1 → pod lead sends back → designer works v2 →
 *   pod lead measures and passes → client approves → client downloads
 *   the STL and the QC certificate.
 */
// Ten minutes a step: version 1 and 2 are 60 server actions between them.
test.describe.configure({ mode: "serial", timeout: 600_000 });

let orderId = "";
const choose = (page: Page, legend: string, option: string) =>
  page.getByRole("group", { name: legend }).getByText(option, { exact: true }).click();

test("a client sends a CAD brief", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Start a CAD brief" }).click();
  await page.waitForURL(/\/orders\/[^/]+\/brief$/);
  orderId = orderIdFrom(page.url());

  // A reference picture first: it reloads the page.
  await page.getByLabel("Add a picture").setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: png([200, 180, 120], 32) });
  await act(page, page.getByRole("button", { name: "Add picture" }));
  await expect(page.getByRole("img").first()).toBeVisible();

  await page.getByLabel("Name this job").fill("E2E halo ring");
  await choose(page, "What are we modelling?", "Ring");
  await choose(page, "Who supplies the stones?", "No stones");
  await page.getByLabel("Ring size", { exact: true }).fill("US 7");
  await choose(page, "Metal colour", "Yellow");
  await page.getByLabel("Karatage / alloy").fill("18K");
  await page.getByRole("group", { name: "What is the CAD for?" }).getByText(/^Cast in metal/).click();
  await choose(page, "Output format", "Both");
  await choose(page, "Finish", "High polish");
  await page.getByRole("button", { name: "Review and send" }).click();

  await page.waitForURL(`**/orders/${orderId}/brief/review`);
  await expect(page.getByText("Still needed before we can price it")).toHaveCount(0);
  await page.getByRole("button", { name: "Send for a price" }).click();
  await page.waitForURL(`**/orders/${orderId}/sent`);
  await page.context().close();
});

test("the admin quotes it, records the payment and confirms the brief", async ({ browser }) => {
  const page = await signedIn(browser, "admin");
  // TEMPORARY trace (stale-screen diagnosis): every page request, the change
  // checks and the console, with times.
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(2)}s`;
  page.on("console", (m) => console.log(`[trace ${at()}] console.${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/orders/") && !u.pathname.startsWith("/api/orders/")) return;
    const h = r.headers();
    const kind = h["next-action"] ? "ACTION" : h["rsc"] ? "RSC" : r.resourceType();
    console.log(`[trace ${at()}] -> ${r.method()} ${kind} ${u.pathname}${u.search.slice(0, 40)}`);
  });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/orders/") && !u.pathname.startsWith("/api/orders/")) return;
    const req = r.request().headers();
    const isRsc = !!req["next-action"] || !!req["rsc"];
    const body = u.pathname.endsWith("/stamp") || isRsc ? await r.text().catch(() => "") : "";
    console.log(`[trace ${at()}] <- ${r.status()} ${u.pathname} ${u.pathname.endsWith("/stamp") ? body : `${body.length} bytes`}`);
    if (isRsc && u.pathname.split("/").length === 3) {
      // Client components (I), resource hints (HL), stylesheets, promises.
      const rows = body.split("\n").filter((l) => /^[0-9a-f]+:(I|HL)\[/.test(l) || /stylesheet|precedence|\$@/.test(l));
      for (const l of rows.slice(0, 25)) console.log(`[trace rsc] ${l.slice(0, 220)}`);
      console.log(`[trace rsc] ${rows.length} notable rows of ${body.split("\n").length}`);
    }
  });
  const sheets = () =>
    page.evaluate(() => ({
      css: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href.split("/").pop()),
      visible: document.visibilityState,
      main: (document.querySelector("main")?.textContent ?? "").match(/(SUBMITTED|QUOTED|PAYMENT_HELD)/)?.[0],
    }));
  page.on("load", () => void sheets().then((x) => console.log(`[trace ${at()}] page ${JSON.stringify(x)}`)).catch(() => {}));
  const watcher = setInterval(() => void sheets().then((x) => console.log(`[trace ${at()}] now ${JSON.stringify(x)}`)).catch(() => {}), 2500);
  await page.goto(`/orders/${orderId}`);
  await act(page, page.getByRole("button", { name: "Set quote" }));
  await settled(page, "quoted", (timeout) => expect(page.getByRole("button", { name: "Mark paid" })).toBeVisible({ timeout }));
  await act(page, page.getByRole("button", { name: "Mark paid" }));
  await expectGone(page, page.getByRole("button", { name: "Mark paid" }));
  await act(page, page.getByRole("button", { name: "Confirm order" }));
  await expectGone(page, page.getByRole("button", { name: "Confirm order" }));
  clearInterval(watcher);
  // One pod: the order went to it on payment (0048).
  await expect(page.getByText("Pod One").first()).toBeVisible();
  await page.context().close();
});

test("the pod lead assigns the designer", async ({ browser }) => {
  const page = await signedIn(browser, "podLead");
  await page.goto(`/orders/${orderId}`);
  // The designer is the pod's only one, so already chosen.
  // The designer's "Start work" (next step) is the proof it took.
  await act(page, page.getByRole("button", { name: "Assign", exact: true }));
  await page.context().close();
});

test("the designer does version 1 and the pod lead sends it back", async ({ browser }) => {
  const designer = await signedIn(browser, "designer");
  await doDesignerVersion(designer, orderId);

  const lead = await signedIn(browser, "podLead");
  await lead.goto(`/qc/${orderId}`);
  await lead.getByLabel("Revision note · required to send back").fill("1. Thicken the shank to 1.2 mm");
  await act(lead, lead.getByRole("button", { name: "Send back" }));
  await expectGone(lead, lead.getByRole("button", { name: "Send back" }));

  // Version 2, from the start: new files, new ticks, the volume again.
  await doDesignerVersion(designer, orderId);
  await designer.context().close();
  await lead.context().close();
});

test("the pod lead measures version 2 and passes it", async ({ browser }) => {
  const page = await signedIn(browser, "podLead");
  await page.goto(`/qc/${orderId}`);
  await tickAll(page, "QC");
  await page.getByLabel("Minimum wall (mm)", { exact: true }).fill("0.9");
  await page.getByLabel("Minimum prong (mm)", { exact: true }).fill("0.85");
  await page.getByLabel("Ring size", { exact: true }).fill("US 7");
  await act(page, page.getByRole("button", { name: "Record measurements" }));
  await settled(page, "measurements recorded", (timeout) =>
    expect(page.getByRole("button", { name: "Update measurements" })).toBeVisible({ timeout }),
  );

  const pass = page.getByRole("button", { name: "Pass to client" });
  await expect(pass).toBeEnabled();
  await act(page, pass);
  await expectGone(page, pass);
  await page.context().close();
});

test("the client approves and downloads the STL and the certificate", async ({ browser }) => {
  const page = await signedIn(browser, "client");
  await page.goto(`/orders/${orderId}/review`);
  await act(page, page.getByRole("button", { name: "Approve this design" }));

  await page.goto("/files");
  const stlRow = page.locator("li", { hasText: "For your caster" }).first();
  const href = await stlRow.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/files\//);
  const stl = await page.request.get(href!);
  expect(stl.status()).toBe(200);
  // The cleaned STL: same 4 facets (84 + 4 × 50 bytes), header rewritten.
  expect((await stl.body()).length).toBe(284);

  const cert = await page.request.get(`/api/orders/${orderId}/certificate`);
  expect(cert.status()).toBe(200);
  expect((await cert.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.context().close();
});
