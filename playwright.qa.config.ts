import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * Design QA (redesign): screenshots of every route, per role, at phone,
 * tablet and desk widths. Runs on the same throwaway stack as the e2e
 * journeys, after them, so the screens show real orders. Not a test of
 * behaviour: it never fails on what a page shows, only if a page errors.
 */
export default defineConfig({
  ...base,
  testDir: "tests/design-qa",
  testMatch: "**/*.qa.ts",
  timeout: 600_000,
  reporter: "list",
  use: { ...base.use, trace: "off", screenshot: "off" },
});
