// `next build` for the e2e stack. NEXT_PUBLIC_* values are fixed at build
// time, so this runs after prepare.ts has made the local keys.
import { spawnSync } from "node:child_process";

import { appEnv } from "./env.mjs";

const env = appEnv();
if (!env) throw new Error("run `npm run e2e:prepare` first");
// Browser source maps for this build only, so a browser error in a test can
// be traced to its component (tests/e2e/zv-timezone.e2e.ts).
const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, ...env, E2E_SOURCE_MAPS: "1" } });
process.exit(r.status ?? 1);
