import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

/**
 * Marketing screenshots (tests/marketing-shots): the demo jeweler's orders
 * made through the real screens on the e2e stack, then each screen at 390
 * and 1440 into marketing-shots/. A fake microphone records the chat's
 * voice note.
 */
export default defineConfig({
  ...base,
  testDir: "tests/marketing-shots",
  testMatch: "**/*.ms.ts",
  timeout: 1_800_000,
  reporter: "list",
  use: {
    ...base.use,
    // A step that cannot happen fails in seconds, not at the 30-minute test limit.
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
});
