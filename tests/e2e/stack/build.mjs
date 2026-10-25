// `next build` for the e2e stack. NEXT_PUBLIC_* values are fixed at build
// time, so this runs after prepare.ts has made the local keys.
import { spawnSync } from "node:child_process";

import { appEnv } from "./env.mjs";

const env = appEnv();
if (!env) throw new Error("run `npm run e2e:prepare` first");
const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: { ...process.env, ...env } });
process.exit(r.status ?? 1);
