import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner, 7 Nov 2026 (0065): a pod lead or a designer never sees what the
 * client pays. The database no longer grants the money columns of `orders`
 * (policies 0048); visible_orders() and pod_jobs() hand them out by who asks.
 * This catches a page that reads them from the table, which would only show
 * up as "permission denied" for every user.
 */
const ROOT = process.cwd();
const MONEY = ["price_total", "designer_payout", "qc_payout", "platform_commission", "designer_payout_paise", "qc_payout_paise"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

describe("order money is read through the functions, never the table", () => {
  it('no app code selects a money column with .from("orders")', () => {
    const offenders: string[] = [];
    for (const f of ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.from\(\s*["']orders["']\s*\)\s*\.select\(\s*["'`]([^"'`]*)["'`]/g)) {
        const cols = (m[1] ?? "").split(",").map((c) => c.trim());
        const bad = cols.filter((c) => c === "*" || MONEY.includes(c));
        if (bad.length) offenders.push(`${relative(ROOT, f)}: ${bad.join(", ")}`);
      }
    }
    expect(offenders, "read money through visible_orders() or pod_jobs()").toEqual([]);
  });
});
