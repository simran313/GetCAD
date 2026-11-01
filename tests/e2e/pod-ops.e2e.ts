import { expect, test } from "@playwright/test";

import { pdfText } from "./pdf";
import { signedIn } from "./helpers";
import { PERSONAS } from "./state";

/**
 * Phase 13c — the pod lead's Performance screen and its downloads, after the
 * journey has run (so there is recorded work). Designers cannot reach either.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

test("the pod lead sees the team's numbers, a designer's history, and downloads the report", async ({ browser }) => {
  const page = await signedIn(browser, "podLead");
  await page.goto("/pod/performance?period=30d");
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByText("Bottlenecks now")).toBeVisible();
  await expect(page.getByText("Submitted to QC").first()).toBeVisible();

  // The designer row leads to their history and timeline.
  await page.getByRole("link", { name: new RegExp(PERSONAS.designer.legalName) }).first().click();
  await expect(page.getByRole("heading", { name: "Job history" })).toBeVisible();
  await expect(page.getByText("Submitted to QC").first()).toBeVisible();

  const xlsx = await page.request.get("/api/pod/report?format=xlsx&period=30d");
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

  const csv = await page.request.get("/api/pod/report?format=csv&period=30d");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain('"Designer","Ref","Pod"');
  expect(text).toContain('"Team"');

  const pdf = await page.request.get("/api/pod/report?format=pdf&period=30d");
  expect(pdf.status()).toBe(200);
  expect(await pdfText(Buffer.from(await pdf.body()))).toMatch(/Bottlenecks now/);
  await page.context().close();
});

test("a designer reaches neither the screen nor the report", async ({ browser }) => {
  const page = await signedIn(browser, "designer");
  await page.goto("/pod/performance");
  await expect(page).not.toHaveURL(/\/pod\/performance/);
  expect((await page.request.get("/api/pod/report?format=csv")).status()).toBe(404);
  await page.context().close();
});
