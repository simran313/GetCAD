// Lighthouse on the marketing pages (redesign targets: mobile performance
// >= 90, LCP < 2.5 s, no layout shift). Runs against the same production
// build the journeys use, after them, on its own port. The thresholds live in
// lighthouserc.json; a miss fails the job.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  try {
    explain();
  } catch (e) {
    console.log(`(could not summarise the reports: ${e.message})`);
  }
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
process.exit(status);

/**
 * What held up the largest paint, from the representative run of each page:
 * the LCP element and its phases, render-blocking files, third parties, the
 * heaviest scripts and downloads. Printed every time, so a miss says why.
 */
function explain() {
  const dir = "lighthouse-report";
  const manifest = join(dir, "manifest.json");
  if (!existsSync(manifest)) return;
  const ms = (v) => `${Math.round(v ?? 0)} ms`;
  const kb = (v) => `${Math.round((v ?? 0) / 1024)} KB`;
  const short = (u) => String(u ?? "").replace(/^https?:\/\/localhost:\d+/, "").slice(0, 90);
  for (const run of JSON.parse(readFileSync(manifest, "utf8")).filter((m) => m.isRepresentativeRun)) {
    const lhr = JSON.parse(readFileSync(run.jsonPath, "utf8"));
    const a = lhr.audits;
    const items = (id) => a[id]?.details?.items ?? [];
    console.log(`\n── ${run.url}  performance ${Math.round(lhr.categories.performance.score * 100)}`);
    for (const id of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "speed-index"]) {
      console.log(`  ${a[id]?.title}: ${a[id]?.displayValue}`);
    }
    for (const part of items("largest-contentful-paint-element")) {
      for (const it of part.items ?? []) {
        if (it.node) console.log(`  LCP element: ${it.node.nodeLabel} — ${it.node.snippet?.slice(0, 120)}`);
        if (it.phase) console.log(`    ${it.phase}: ${ms(it.timing)}`);
      }
    }
    const list = (title, id, row) => {
      const xs = items(id);
      if (xs.length) console.log(`  ${title}:`);
      for (const x of xs.slice(0, 8)) console.log(`    ${row(x)}`);
    };
    list("Render-blocking", "render-blocking-resources", (x) => `${short(x.url)}  ${kb(x.totalBytes)}  ${ms(x.wastedMs)}`);
    list("Third parties", "third-party-summary", (x) => `${x.entity?.text ?? x.entity}  ${kb(x.transferSize)}  main thread ${ms(x.mainThreadTime)}`);
    list("Script time", "bootup-time", (x) => `${short(x.url)}  ${ms(x.total)}`);
    list("Heaviest downloads", "total-byte-weight", (x) => `${short(x.url)}  ${kb(x.totalBytes)}`);
  }
}
