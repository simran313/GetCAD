import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, givePayoutAccount } from "../helpers/db";

/**
 * db/ops/clerk-id-remap.sql: the one-off move from Clerk development user ids
 * to production ones. Pinned: every reference moves (foreign keys and plain
 * text columns, immutable tables included), nothing else changes (no trigger
 * fires: no email, notification or state change), the audit chain stays valid
 * with history untouched, the moved person reads their own data under the new
 * id, a dry run changes nothing, and a bad list is refused whole.
 */
let db: Client;

const cid = () => `user_${generateId().replace(/-/g, "")}`;
const designer = cid();
const lead = cid();
const client = cid();
const newDesigner = cid();
const newLead = cid();
let orderId: string;
let auditBefore: number;

const SQL = readFileSync(join(process.cwd(), "db/ops/clerk-id-remap.sql"), "utf8");

function script(pairs: [string, string, string][], dryRun: boolean): string {
  const values = pairs.map(([o, n, e]) => `    ('${o}', '${n}', '${e}')`).join(",\n");
  return SQL.replace(/-- MAP:BEGIN[\s\S]*-- MAP:END/, `-- MAP:BEGIN\n${values}\n  -- MAP:END`).replace(
    "dry_run constant boolean := true;",
    `dry_run constant boolean := ${dryRun};`,
  );
}

async function asUser<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  await db.query("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

const count = async (sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].n);

/** Every text cell in public/app equal to one of `ids`. */
async function cellsHolding(ids: string[]): Promise<number> {
  const cols = await db.query(
    `SELECT c.table_schema s, c.table_name t, c.column_name col FROM information_schema.columns c
       JOIN information_schema.tables tb USING (table_schema, table_name)
      WHERE tb.table_type='BASE TABLE' AND c.table_schema IN ('public','app') AND c.data_type IN ('text','character varying')`,
  );
  let total = 0;
  for (const { s, t, col } of cols.rows) {
    total += await count(`SELECT count(*) AS n FROM "${s}"."${t}" WHERE "${col}" = ANY($1)`, [ids]);
  }
  return total;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'DESIGNER','ACTIVE'), ($2,'QC','ACTIVE'), ($3,'CLIENT','ACTIVE')`,
    [designer, lead, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,'OPS',$1)", [lead]);
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at, agreement_version)
     VALUES ($1,$2,'Dana','dana@x.example', now(), (SELECT version FROM app.current_agreement('DESIGNER')))`,
    [generateId(), designer],
  );
  await db.query(
    `INSERT INTO agreement_acceptances (agreement_id, user_id, content_sha256)
     SELECT id, $1, content_sha256 FROM app.current_agreement('DESIGNER')`,
    [designer],
  );
  await givePayoutAccount(db, designer);
  const pod = (await db.query("INSERT INTO pods (name) VALUES ('North') RETURNING id")).rows[0].id;
  await db.query(
    "INSERT INTO pod_members (pod_id, user_id, member_role, added_by) VALUES ($1,$2,'POD_LEAD',$2), ($1,$3,'DESIGNER',$2)",
    [pod, lead, designer],
  );
  orderId = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout,
                         platform_commission, category, tier, pod_id, pod_lead_id, job_code, sla_due_at)
     VALUES ($1,$2,'RING','PAYMENT_HELD','USD',5500,0,0,5500,'C',(SELECT tier FROM job_categories WHERE letter='C'),$3,$4,
             'RN-C-1001', now() + interval '6 hours')`,
    [orderId, client, pod, lead],
  );
  await asUser(lead, () => db.query("SELECT public.assign_designer($1,$2)", [orderId, designer]));
  await asUser(designer, () => db.query("SELECT public.post_message($1,'Started on the shank')", [orderId]));
  await db.query("SELECT audit.log_event('FIXTURE', 'users', $1, $1, 'DESIGNER')", [designer]);
  auditBefore = await count("SELECT count(*) AS n FROM audit.audit_log");
});

afterAll(async () => {
  await db?.end();
});

async function run(sql: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (e) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

describe("clerk-id-remap.sql", () => {
  it("dry run: reports, changes nothing", async () => {
    const before = await cellsHolding([designer, lead]);
    await expect(run(script([[designer, newDesigner, "dana@x.example"], [lead, newLead, "lead@x.example"]], true))).rejects.toThrow(
      /DRY RUN OK, nothing was changed\. Would move 2 accounts/,
    );
    expect(await cellsHolding([designer, lead])).toBe(before);
    expect(await cellsHolding([newDesigner, newLead])).toBe(0);
    expect(await count("SELECT count(*) AS n FROM audit.audit_log")).toBe(auditBefore);
  });

  it("refuses a list whose new id already has an account, changing nothing", async () => {
    await expect(run(script([[designer, client, "x@x.example"]], false))).rejects.toThrow(/already have an account here/);
    await expect(run(script([[designer, "not-a-clerk-id", "x@x.example"]], false))).rejects.toThrow(/Not a pair of Clerk user ids/);
    await expect(run(script([[cid(), cid(), "ghost@x.example"]], false))).rejects.toThrow(/None of the old ids/);
    expect(await count("SELECT count(*) AS n FROM users WHERE id=$1", [designer])).toBe(1);
  });

  it("moves every reference, fires no trigger, keeps the audit chain, and the person reads their data", async () => {
    const counts = async () => ({
      notifications: await count("SELECT count(*) AS n FROM notifications"),
      messages: await count("SELECT count(*) AS n FROM messages"),
      emails: await count("SELECT count(*) AS n FROM email_outbox"),
      orders: (await db.query("SELECT status, sla_due_at, price_total FROM orders WHERE id=$1", [orderId])).rows[0],
    });
    const before = await counts();
    const held = await cellsHolding([designer, lead]);
    expect(held).toBeGreaterThan(8);

    const ghost = cid();
    await run(script([[designer, newDesigner, "dana@x.example"], [lead, newLead, "lead@x.example"], [ghost, cid(), "test@x.example"]], false));

    expect(await cellsHolding([designer, lead])).toBe(0);
    expect(await cellsHolding([newDesigner, newLead])).toBe(held);
    expect((await db.query("SELECT designer_id, pod_lead_id FROM orders WHERE id=$1", [orderId])).rows[0]).toEqual({
      designer_id: newDesigner,
      pod_lead_id: newLead,
    });
    expect(await count("SELECT count(*) AS n FROM agreement_acceptances WHERE user_id=$1", [newDesigner])).toBe(1);
    expect(await count("SELECT count(*) AS n FROM payout_accounts WHERE user_id=$1", [newDesigner])).toBe(1);
    // Immutable rows move too (the chat must still show the designer's own messages as theirs).
    expect(await count("SELECT count(*) AS n FROM messages WHERE sender_id=$1", [newDesigner])).toBe(1);
    expect(await counts()).toEqual(before);

    // History untouched; the move itself recorded; the chain still verifies.
    expect(await count("SELECT count(*) AS n FROM audit.audit_log WHERE action='FIXTURE' AND actor_id=$1", [designer])).toBe(1);
    const entry = (await db.query("SELECT payload FROM audit.audit_log WHERE action='CLERK_INSTANCE_MIGRATION'")).rows;
    expect(entry).toHaveLength(1);
    expect(entry[0].payload.map).toHaveLength(2);
    expect(entry[0].payload.skipped_not_in_database).toEqual(["test@x.example"]);
    expect((await db.query("SELECT audit.verify_chain() AS v")).rows[0].v.valid).toBe(true);

    // Signed in under the new id, the designer is the same person: role, job.
    const me = await asUser(newDesigner, () => db.query("SELECT app.current_user_role()::text AS role"));
    expect(me.rows[0].role).toBe("DESIGNER");
    const jobs = await asUser(newDesigner, () => db.query("SELECT order_id FROM public.my_work($1)", [orderId]));
    expect(jobs.rows).toEqual([{ order_id: orderId }]);
    // The old id is nobody now.
    const old = await asUser(designer, () => db.query("SELECT order_id FROM public.my_work($1)", [orderId]));
    expect(old.rows).toEqual([]);
  });

  it("refuses to run the same list twice", async () => {
    await expect(run(script([[designer, newDesigner, "dana@x.example"]], false))).rejects.toThrow(/already have an account here/);
  });
});
