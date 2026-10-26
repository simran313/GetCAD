// Lighthouse on the marketing pages (redesign targets: mobile performance
// >= 90, LCP < 2.5 s, no layout shift). Runs against the same production
// build the journeys use, after them, on its own port. The thresholds live in
// lighthouserc.json; a miss fails the job.
import { spawn, spawnSync } from "node:child_process";

import { appEnv } from "./env.mjs";

const PORT = 3200;
const env = appEnv();
if (!env) throw new Error("run `npm run e2e:prepare` and `npm run e2e:build` first");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, ...env },
  stdio: "ignore",
  detached: true,
});

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(`next start did not answer on :${PORT} within 60 s`);
}

let status = 1;
try {
  await ready();
  const r = spawnSync("npx", ["--yes", "@lhci/cli@0.15.1", "autorun", "--config=lighthouserc.json"], {
    stdio: "inherit",
    env: process.env,
  });
  status = r.status ?? 1;
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
process.exit(status);
