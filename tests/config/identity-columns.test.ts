import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two source-level guards that back the database rules with a faster signal.
 *
 * IDENTITY COLUMNS. Since 0036 no app user can select another person's raw
 * user id; the database answers "permission denied". This catches the same
 * mistake at `npm test` time instead of as a broken page: no app code may name
 * a hidden id column in a `.select(...)`.
 *
 * TCC. DECISIONS §1 and §14: no data, files, clients, portfolio or branding of
 * The CAD Co. anywhere in code, seed data or content.
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "core", "lib", "config", "db", "scripts", "public"];
const HIDDEN = [
  "client_id",
  "designer_id",
  "qc_reviewer_id",
  "org_id",
  "pod_lead_id",
  "created_on_behalf_by",
  "confirmed_by",
  "sender_id",
  "uploaded_by",
  "raised_by",
  "resolved_by",
  "created_by",
];

function files(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

describe("app code never selects a hidden identity column", () => {
  it("no .select(...) string names one", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of files(join(ROOT, dir)).filter((f) => /\.(ts|tsx)$/.test(f))) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
          const cols = m[2] ?? "";
          for (const col of HIDDEN) {
            if (new RegExp(`\\b${col}\\b`).test(cols)) offenders.push(`${relative(ROOT, file)}: ${col}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no TCC content (DECISIONS §1, §14)", () => {
  it("no source, seed or public file mentions The CAD Co.", () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of files(join(ROOT, dir)).filter((f) => /\.(ts|tsx|js|mjs|sql|json|md|txt|html|css)$/.test(f))) {
        const text = readFileSync(file, "utf8");
        if (/\bTCC\b|The CAD Co\b/.test(text)) offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
