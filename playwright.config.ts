import { defineConfig, devices } from "@playwright/test";

import { appEnv } from "./tests/e2e/stack/env.mjs";

/**
 * Phase 8 — end-to-end tests in a real browser against a real build.
 *
 * The stack (tests/e2e/README.md): the throwaway Postgres, PostgREST, the
 * gateway in tests/e2e/stack (REST pass-through + file store), `next start`,
 * and a Clerk DEVELOPMENT instance for sign-in. One worker: the journeys
 * share one database and run in order.
 */
const env = appEnv() ?? {};
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/stack/gateway.mjs",
      url: "http://127.0.0.1:54321/health",
      env: { SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/`,
      env,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
  ],
});
