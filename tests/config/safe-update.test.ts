import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Supabase loads pg_safeupdate for API calls: an UPDATE or DELETE with no
 * WHERE clause fails with "UPDATE requires a WHERE clause". The local test
 * database does not load it, so 0072's billing_settings_save passed every test
 * and failed in production (fixed in 0073). This reads the latest definition
 * of every function and fails on such a statement inside its body. Top-level
 * statements in a migration run in the SQL editor, where the rule does not
 * apply, so they are not checked.
 */
const DIRS = ["db/migrations", "db/policies"].map((d) => join(process.cwd(), d));

function latestBodies(): Map<string, { file: string; body: string }> {
  const out = new Map<string, { file: string; body: string }>();
  for (const dir of DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dir, file), "utf8");
      const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi;
      for (const m of sql.matchAll(re)) out.set(m[1]!.toLowerCase(), { file, body: m[4]! });
    }
  }
  return out;
}

function unguarded(body: string): string[] {
  const code = body.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return code
    .split(";")
    .map((s) => s.trim())
    .filter((s) => /\b(UPDATE\s+[\w."]+(\s+(AS\s+)?\w+)?\s+SET|DELETE\s+FROM)\b/i.test(s))
    .filter((s) => !/\bWHERE\b/i.test(s.slice(s.search(/\b(UPDATE|DELETE)\b/i))))
    .map((s) => s.replace(/\s+/g, " ").slice(0, 80));
}

describe("every UPDATE and DELETE in a function has a WHERE (Supabase pg_safeupdate)", () => {
  it("finds function bodies to check", () => {
    expect(latestBodies().size).toBeGreaterThan(100);
  });

  it("has no unguarded UPDATE or DELETE", () => {
    const offenders = [...latestBodies()].flatMap(([name, { file, body }]) => unguarded(body).map((s) => `${file} ${name}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it("would catch 0072's original save", () => {
    expect(unguarded("BEGIN UPDATE public.billing_settings SET a = 1, b = now(); END")).toHaveLength(1);
    expect(unguarded("BEGIN UPDATE public.billing_settings SET a = 1 WHERE id; END")).toHaveLength(0);
  });
});
