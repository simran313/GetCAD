#!/usr/bin/env node
/**
 * One-off, for the switch to a Clerk production instance (docs/CLERK-PRODUCTION.md).
 *
 * Copies every account from the Clerk DEVELOPMENT instance into the PRODUCTION
 * instance (same email and name; no password: people sign in with an email
 * code or "Forgot password"), then writes the old id -> new id list and a
 * ready-to-paste db/ops/clerk-id-remap.sql with that list filled in.
 *
 * It never touches the database, and it changes nothing in either Clerk
 * instance unless you pass --apply. Safe to re-run: an email that already has
 * a production account is reused, not duplicated.
 *
 *   CLERK_DEV_SECRET_KEY=sk_test_… CLERK_PROD_SECRET_KEY=sk_live_… \
 *     node scripts/clerk-copy-users.mjs            # plan: lists what it would do
 *   … node scripts/clerk-copy-users.mjs --apply    # creates the production accounts
 *
 * Output (git-ignored, holds emails; delete after the switch):
 *   .clerk-migration/clerk-id-map.csv
 *   .clerk-migration/clerk-id-remap.ready.sql
 *
 * Skipped: Clerk test accounts (emails with "+clerk_test", used by the browser
 * tests) and accounts with no email address.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".clerk-migration");
const API = "https://api.clerk.com/v1";
const apply = process.argv.includes("--apply");

const dev = process.env.CLERK_DEV_SECRET_KEY ?? "";
const prod = process.env.CLERK_PROD_SECRET_KEY ?? "";
if (!dev.startsWith("sk_test_")) fail("CLERK_DEV_SECRET_KEY must be the development secret key (starts sk_test_).");
if (!prod.startsWith("sk_live_")) fail("CLERK_PROD_SECRET_KEY must be the production secret key (starts sk_live_).");

function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clerk(key, method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const why = json?.errors?.map((e) => e.long_message || e.message).join("; ") || res.statusText;
      throw new Error(`${method} ${path.split("?")[0]} → ${res.status}: ${why}`);
    }
    return json;
  }
}

async function allUsers(key) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerk(key, "GET", `/users?limit=100&offset=${offset}&order_by=created_at`);
    out.push(...page);
    if (page.length < 100) return out;
  }
}

const primaryEmail = (u) =>
  (u.email_addresses ?? []).find((e) => e.id === u.primary_email_address_id)?.email_address?.toLowerCase() ?? null;

const devUsers = await allUsers(dev);
console.log(`Development instance: ${devUsers.length} accounts.`);

const rows = [];
let created = 0;
let reused = 0;
let skipped = 0;
for (const u of devUsers) {
  const email = primaryEmail(u);
  if (!email || email.includes("+clerk_test")) {
    skipped++;
    console.log(`  skip   ${u.id}  ${email ?? "(no email)"}`);
    continue;
  }
  const existing = await clerk(prod, "GET", `/users?email_address=${encodeURIComponent(email)}&limit=1`);
  let newId = existing[0]?.id ?? null;
  if (newId) {
    reused++;
    console.log(`  exists ${u.id} -> ${newId}  ${email}`);
  } else if (apply) {
    const made = await clerk(prod, "POST", "/users", {
      email_address: [email],
      first_name: u.first_name || undefined,
      last_name: u.last_name || undefined,
      username: u.username || undefined,
      skip_password_requirement: true,
    });
    newId = made.id;
    created++;
    console.log(`  create ${u.id} -> ${newId}  ${email}`);
    await sleep(150);
  } else {
    console.log(`  would create  ${u.id}  ${email}`);
  }
  if (newId) rows.push({ oldId: u.id, newId, email });
}

console.log(`\n${apply ? "Created" : "Would create"} ${apply ? created : devUsers.length - skipped - reused}, already there ${reused}, skipped ${skipped}.`);
if (!apply) {
  console.log("Plan only: nothing was created. Run again with --apply to create the production accounts.\n");
  process.exit(0);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "clerk-id-map.csv"), ["old_id,new_id,email", ...rows.map((r) => `${r.oldId},${r.newId},${r.email}`)].join("\n") + "\n");
const values = rows.map((r) => `    (${q(r.oldId)}, ${q(r.newId)}, ${q(r.email)})`).join(",\n");
const template = readFileSync(join(ROOT, "db/ops/clerk-id-remap.sql"), "utf8");
if (!/-- MAP:BEGIN[\s\S]*-- MAP:END/.test(template)) fail("db/ops/clerk-id-remap.sql has no MAP block.");
writeFileSync(
  join(OUT, "clerk-id-remap.ready.sql"),
  template.replace(/-- MAP:BEGIN[\s\S]*-- MAP:END/, `-- MAP:BEGIN\n${values}\n  -- MAP:END`),
);
console.log(`Wrote .clerk-migration/clerk-id-map.csv and .clerk-migration/clerk-id-remap.ready.sql (${rows.length} accounts).`);
console.log("Next: docs/CLERK-PRODUCTION.md, step 5 (dry run in the Supabase SQL Editor).\n");
