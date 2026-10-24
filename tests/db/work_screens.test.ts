import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { completeDesignerWork, connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 5c (0047): what the designer and pod lead screens read. A designer
 * sees their own jobs by job code with the Start-work clock and nothing of
 * the client; a pod lead sees their own pod only; earnings are the caller's.
 */

let db: Client;

const admin = generateId();
const client = generateId();
const designer = generateId();
const otherDesigner = generateId();
const podLead = generateId();
const otherLead = generateId();

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

const q = (sub: string, sql: string, params: unknown[] = []) => asUser(sub, () => db.query(sql, params));

/** A paid, categorised order in podLead's pod, assigned to the designer. */
async function assignedJob(lead = podLead, who = designer): Promise<string> {
  const id = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
  await q(client, `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Mrs Smith halo', p_product => 'RING', p_metal => 'WHITE')`, [id]);
  await putOrderInPod(db, id, lead);
  await db.query(
    `UPDATE orders SET status='ASSIGNED', category='D', designer_id=$2, designer_payout_paise=50000,
            qc_payout_paise=90000, price_total=8500, currency='USD', sla_due_at=now() + interval '6 hours'
      WHERE id=$1`,
    [id, who],
  );
  await db.query("INSERT INTO job_assignments (order_id, designer_id, assigned_by) VALUES ($1,$2,$3)", [id, who, lead]);
  return id;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'DESIGNER','ACTIVE'),
       ($5,'QC','ACTIVE'), ($6,'QC','ACTIVE')`,
    [admin, client, designer, otherDesigner, podLead, otherLead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES
       ($1,$2,'Rohan M','r@example.com'), ($3,$4,'Priya S','p@example.com')`,
    [generateId(), designer, generateId(), otherDesigner],
  );
  await db.query("INSERT INTO client_accounts (user_id, code_prefix, code_n) VALUES ($1,'TT',7)", [client]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("my_work (D2–D4)", () => {
  it("lists the designer's jobs by job code with the Start-work clock, nothing of the client", async () => {
    const id = await assignedJob();
    const before = await q(designer, "SELECT * FROM public.my_work($1)", [id]);
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].started_at).toBeNull();
    expect(before.rows[0].minutes).toBe(60);
    expect(before.rows[0].pay_paise).toBe(50000);
    expect(before.rows[0].job_code).toMatch(/\S/);
    const cols = Object.keys(before.rows[0]);
    for (const banned of ["order_ref", "title", "client_code", "price_total", "currency"]) expect(cols).not.toContain(banned);

    await q(designer, "SELECT public.transition_order($1,'IN_PROGRESS')", [id]);
    const after = await q(designer, "SELECT started_at, status FROM public.my_work($1)", [id]);
    expect(after.rows[0].status).toBe("IN_PROGRESS");
    expect(after.rows[0].started_at).not.toBeNull();

    // Another designer, a client and a pod lead get nothing from it.
    expect((await q(otherDesigner, "SELECT * FROM public.my_work($1)", [id])).rows).toHaveLength(0);
    expect((await q(client, "SELECT * FROM public.my_work()")).rows).toHaveLength(0);
    expect((await q(podLead, "SELECT * FROM public.my_work()")).rows).toHaveLength(0);
  });
});

describe("pod_jobs and pod_load (P1, P3, P5)", () => {
  it("a pod lead sees their own pod with designer, client code and progress; never another pod", async () => {
    const mine = await assignedJob();
    const theirs = await assignedJob(otherLead, otherDesigner);
    const podId = (await db.query("SELECT pod_id FROM orders WHERE id=$1", [mine])).rows[0].pod_id;
    await db.query("INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'DESIGNER')", [podId, designer]);

    await q(designer, "SELECT public.transition_order($1,'IN_PROGRESS')", [mine]);
    await completeDesignerWork(db, mine, designer);
    await q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [mine]);

    const rows = (await q(podLead, "SELECT * FROM public.pod_jobs()")).rows;
    const ids = rows.map((r) => r.order_id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
    const row = rows.find((r) => r.order_id === mine)!;
    expect(row).toMatchObject({
      status: "QC_REVIEW",
      designer_id: designer,
      designer_name: "Rohan M",
      client_code: "TT7",
      title: "Mrs Smith halo",
      designer_ticks: 19,
      qc_ticks: 0,
      minutes: 60,
    });
    expect(row.submitted_at).not.toBeNull();

    const load = (await q(podLead, "SELECT * FROM public.pod_load()")).rows;
    expect(load.map((l) => l.designer_id)).toEqual([designer]);
    expect(load[0].shift_minutes).toBe(480);

    // Admin sees every pod; a designer and a client see none.
    const adminIds = (await q(admin, "SELECT order_id FROM public.pod_jobs()")).rows.map((r) => r.order_id);
    expect(adminIds).toEqual(expect.arrayContaining([mine, theirs]));
    expect((await q(designer, "SELECT * FROM public.pod_jobs()")).rows).toHaveLength(0);
    expect((await q(client, "SELECT * FROM public.pod_load()")).rows).toHaveLength(0);
  });
});

describe("my_earnings (D6, P4)", () => {
  it("is the caller's own, with the job code for a designer and the order ref for QC", async () => {
    const id = await assignedJob();
    await db.query(
      `INSERT INTO payout_obligations (order_id, payee_id, party, amount_paise) VALUES ($1,$2,'DESIGNER',50000), ($1,$3,'QC',90000)`,
      [id, designer, podLead],
    );
    const codes = (await db.query("SELECT job_code, order_ref FROM orders WHERE id=$1", [id])).rows[0];
    const d = (await q(designer, "SELECT * FROM public.my_earnings()")).rows;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ party: "DESIGNER", amount_paise: 50000, display_ref: codes.job_code, category: "D" });
    const p = (await q(podLead, "SELECT * FROM public.my_earnings()")).rows;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ party: "QC", amount_paise: 90000, display_ref: codes.order_ref });
    expect((await q(admin, "SELECT * FROM public.my_earnings()")).rows).toHaveLength(0);
  });
});

describe("the rate card (D6)", () => {
  it("a designer reads the category table; a client does not", async () => {
    const d = await q(designer, "SELECT letter, designer_rate_paise FROM job_categories ORDER BY letter");
    expect(d.rows).toHaveLength(12);
    expect(d.rows[0]).toEqual({ letter: "A", designer_rate_paise: 12500 });
    expect((await q(client, "SELECT letter FROM job_categories")).rows).toHaveLength(0);
  });
});
