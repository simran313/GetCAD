// Reads .e2e/app.env (written by tests/e2e/prepare.ts) into an env object.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function appEnv() {
  const file = join(process.cwd(), ".e2e", "app.env");
  if (!existsSync(file)) return null;
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}
