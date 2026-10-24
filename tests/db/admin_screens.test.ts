import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * Phase 5d (0048): automatic pod routing when there is exactly one pod, the
 * account manager per client, and the admin reads.
 */

let db: Client;

const admin = generateId();
const ops = generateId();
const client = generateId();
const designer = generateId();
const lead = generateId();
const lead2 = generateId();

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

async function order(): Promise<string> {
  const id = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
  await q(client, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
  return id;
}

const podOf = async (id: string) =>
  (await db.query("SELECT pod_id, pod_lead_id FROM orders WHERE id=$1", [id])).rows[0] as { pod_id: string | null; pod_lead_id: string | null };

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'CLIENT','ACTIVE'), ($4,'DESIGNER','ACTIVE'), ($5,'QC','ACTIVE'), ($6,'QC','ACTIVE')`,
    [admin, ops, client, designer, lead, lead2],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Fazil'), ($2,'Priya')", [admin, lead]);
  await db.query("INSERT INTO client_accounts (user_id, code_prefix, code_n) VALUES ($1,'MR',3)", [client]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("automatic pod routing", () => {
  it("waits while there is no pod, then joins the only pod when paid", async () => {
    const early = await order();
    await db.query("UPDATE orders SET status='PAYMENT_HELD' WHERE id=$1", [early]);
    expect((await podOf(early)).pod_id).toBeNull();

    const pod = (await q(admin, "SELECT public.create_pod('Pod 1') AS id")).rows[0].id as string;
    await q(admin, "SELECT public.set_pod_member($1,$2,'POD_LEAD')", [pod, lead]);

    const id = await order();
    await db.query("UPDATE orders SET status='QUOTED' WHERE id=$1", [id]);
    expect((await podOf(id)).pod_id).toBeNull();
    await db.query("UPDATE orders SET status='PAYMENT_HELD' WHERE id=$1", [id]);
    expect(await podOf(id)).toEqual({ pod_id: pod, pod_lead_id: lead });
    const audit = await db.query(
      "SELECT payload FROM audit.audit_log WHERE entity_id=$1 AND action='ORDER_POD_ASSIGNED'",
      [id],
    );
    expect(audit.rows[0].payload).toMatchObject({ pod_id: pod, automatic: true });
  });

  it("joins on confirmation too, and leaves the choice to an admin once there are two pods", async () => {
    const id = await order();
    await db.query("UPDATE orders SET confirmed_at=now() WHERE id=$1", [id]);
    expect((await podOf(id)).pod_lead_id).toBe(lead);

    const pod2 = (await q(admin, "SELECT public.create_pod('Pod 2') AS id")).rows[0].id as string;
    await q(admin, "SELECT public.set_pod_member($1,$2,'POD_LEAD')", [pod2, lead2]);
    const later = await order();
    await db.query("UPDATE orders SET status='PAYMENT_HELD' WHERE id=$1", [later]);
    expect((await podOf(later)).pod_id).toBeNull();

    const pods = (await q(admin, "SELECT name, lead_id, lead_name FROM public.pods_overview()")).rows;
    expect(pods).toEqual([
      { name: "Pod 1", lead_id: lead, lead_name: "Priya" },
      { name: "Pod 2", lead_id: lead2, lead_name: null },
    ]);
    await expect(q(ops, "SELECT * FROM public.pods_overview()")).rejects.toThrow(/admin/i);
  });
});

describe("account managers (A9)", () => {
  it("an admin names a team member for a client; clients are listed by code", async () => {
    await expect(q(admin, "SELECT public.set_account_manager($1,$2)", [client, designer])).rejects.toThrow(/on the team/i);
    await expect(q(ops, "SELECT public.set_account_manager($1,$2)", [client, admin])).rejects.toThrow(/admin/i);
    await q(admin, "SELECT public.set_account_manager($1,$2)", [client, admin]);

    const rows = (await q(admin, "SELECT * FROM public.admin_clients()")).rows;
    const me = rows.find((r) => r.client_id === client)!;
    expect(me).toMatchObject({ client_code: "MR3", manager_id: admin, manager_name: "Fazil" });
    expect(me.orders).toBeGreaterThan(0);
    expect(Object.keys(me)).not.toContain("business_name");

    await q(admin, "SELECT public.set_account_manager($1,NULL)", [client]);
    expect((await q(admin, "SELECT manager_id FROM public.admin_clients() WHERE client_id=$1", [client])).rows[0].manager_id).toBeNull();
    await expect(q(client, "SELECT * FROM client_managers")).rejects.toThrow(/permission denied/i);
  });
});

describe("admin reads", () => {
  it("pod_jobs: the admin roles see every order; a designer's name only for admins and the pod lead", async () => {
    const id = await order();
    await db.query(
      "INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'Rohan M','r@example.com')",
      [generateId(), designer],
    );
    await db.query("UPDATE orders SET designer_id=$2, status='PAYMENT_HELD' WHERE id=$1", [id, designer]);
    const forAdmin = (await q(admin, "SELECT designer_name, client_code FROM public.pod_jobs($1)", [id])).rows[0];
    expect(forAdmin).toEqual({ designer_name: "Rohan M", client_code: "MR3" });
    const forOps = (await q(ops, "SELECT designer_name, designer_ref FROM public.pod_jobs($1)", [id])).rows[0];
    expect(forOps.designer_name).toBeNull();
    expect(forOps.designer_ref).toMatch(/\S/);
    expect((await q(client, "SELECT * FROM public.pod_jobs($1)", [id])).rows).toHaveLength(0);
  });

  it("money_ledger is admin or finance only; list_platform_users carries each account's reference", async () => {
    await expect(q(ops, "SELECT * FROM public.money_ledger()")).rejects.toThrow(/admin or finance/i);
    await q(admin, "SELECT * FROM public.money_ledger()");
    const users = (await q(ops, "SELECT id, reference FROM public.list_platform_users()")).rows;
    expect(users.find((u) => u.id === client)?.reference).toBe("MR3");
    const search = (await q(ops, "SELECT id FROM public.list_platform_users('MR3')")).rows;
    expect(search.map((u) => u.id)).toEqual([client]);
  });
});
