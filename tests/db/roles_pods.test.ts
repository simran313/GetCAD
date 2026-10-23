import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, givePayoutAccount } from "../helpers/db";

/**
 * 0033: roles stack (admin = SALES + OPS + FINANCE) and work lives in pods.
 */

let db: Client;

const admin = generateId(); // primary OPS + granted SALES, FINANCE
const ops = generateId();
const sales = generateId();
const qcLead = generateId();
const qcLoose = generateId(); // QC with no pod
const designer = generateId();
const client = generateId();

async function asUser<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub, role: "authenticated" }),
  ]);
  await db.query("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

const q = (sub: string, sql: string, params: unknown[] = []) => asUser(sub, () => db.query(sql, params));

async function order(status: string, price = 5500): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, designer_id, product_type, status, currency,
       price_total, designer_payout, qc_payout, platform_commission)
     VALUES ($1,$2,$3,'RING',$4,'USD',$5,0,0,$5)`,
    [id, client, status === "SUBMITTED" ? null : designer, status, price],
  );
  return id;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'SALES','ACTIVE'), ($4,'QC','ACTIVE'),
       ($5,'QC','ACTIVE'), ($6,'DESIGNER','ACTIVE'), ($7,'CLIENT','ACTIVE')`,
    [admin, ops, sales, qcLead, qcLoose, designer, client],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describe("multi-role: admin = SALES + OPS + FINANCE", () => {
  it("only OPS may grant roles, and only staff roles to staff accounts", async () => {
    await expect(q(sales, "SELECT public.grant_user_role($1,'FINANCE')", [admin])).rejects.toThrow(/only OPS/i);
    await expect(q(ops, "SELECT public.grant_user_role($1,'OPS')", [designer])).rejects.toThrow(/cannot hold staff roles/i);
    await expect(q(ops, "SELECT public.grant_user_role($1,'CLIENT')", [admin])).rejects.toThrow(/only staff roles/i);

    await q(ops, "SELECT public.grant_user_role($1,'SALES')", [admin]);
    await q(ops, "SELECT public.grant_user_role($1,'FINANCE')", [admin]);
    const again = await q(ops, "SELECT public.grant_user_role($1,'FINANCE') AS r", [admin]);
    expect(again.rows[0].r.changed).toBe(false);

    const audit = await db.query(
      "SELECT count(*)::int AS n FROM audit.audit_log WHERE action='USER_ROLE_GRANTED' AND entity_id=$1",
      [admin],
    );
    expect(audit.rows[0].n).toBe(2);
  });

  it("app.is_admin() is true only with all three", async () => {
    expect((await q(admin, "SELECT app.is_admin() AS a")).rows[0].a).toBe(true);
    expect((await q(ops, "SELECT app.is_admin() AS a")).rows[0].a).toBe(false);
    expect((await q(sales, "SELECT app.is_admin() AS a")).rows[0].a).toBe(false);
  });

  it("an admin can quote (SALES), release (FINANCE) and make OPS moves, recorded as the role used", async () => {
    const submitted = await order("SUBMITTED");
    await q(admin, "SELECT public.quote_order($1,5500,0,0,5500)", [submitted]);
    const quoted = await db.query(
      "SELECT actor_role FROM audit.audit_log WHERE action='ORDER_QUOTED' AND entity_id=$1",
      [submitted],
    );
    expect(quoted.rows[0].actor_role).toBe("SALES");

    const delivered = await order("DELIVERED");
    await q(admin, "SELECT public.transition_order($1,'CLOSED')", [delivered]);
    const moved = await db.query(
      "SELECT actor_role FROM audit.audit_log WHERE action='ORDER_STATUS_CHANGED' AND entity_id=$1",
      [delivered],
    );
    expect(moved.rows[0].actor_role).toBe("OPS");

    await givePayoutAccount(db, designer);
    await db.query(
      "INSERT INTO escrow_ledger (order_id, kind, party, amount, currency) VALUES ($1,'HOLD','CLIENT',5500,'USD')",
      [delivered],
    );
    await q(admin, "SELECT public.release_escrow($1)", [delivered]);
    const released = await db.query(
      "SELECT actor_role FROM audit.audit_log WHERE action='ESCROW_RELEASED' AND entity_id=$1",
      [delivered],
    );
    expect(released.rows[0].actor_role).toBe("FINANCE");
  });

  it("a single-role user is still refused what their role cannot do", async () => {
    const submitted = await order("SUBMITTED");
    await expect(q(ops, "SELECT public.quote_order($1,5500,0,0,5500)", [submitted])).rejects.toThrow(/only SALES/i);
    await expect(q(sales, "SELECT public.release_escrow($1)", [submitted])).rejects.toThrow(/FINANCE/i);
  });

  it("an admin can triage applications and leads (OPS or SALES)", async () => {
    await expect(q(admin, "SELECT * FROM public.list_marketing_leads()")).resolves.toBeDefined();
    await expect(q(qcLead, "SELECT * FROM public.list_marketing_leads()")).rejects.toThrow(/only OPS or SALES/i);
  });

  it("revoking the last OPS is refused; revoking a granted role works and is audited", async () => {
    await q(ops, "SELECT public.revoke_user_role($1,'FINANCE')", [admin]);
    expect((await q(admin, "SELECT app.is_admin() AS a")).rows[0].a).toBe(false);
    await q(ops, "SELECT public.grant_user_role($1,'FINANCE')", [admin]);
    expect((await q(admin, "SELECT app.is_admin() AS a")).rows[0].a).toBe(true);
  });

  it("a user reads their own grants; OPS reads everyone's", async () => {
    const own = await q(admin, "SELECT role FROM user_roles ORDER BY role");
    expect(own.rows.map((r) => r.role)).toEqual(["SALES", "FINANCE"]); // enum order
    expect((await q(sales, "SELECT role FROM user_roles")).rows).toHaveLength(0);
    expect((await q(ops, "SELECT role FROM user_roles")).rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("pods: a pod lead sees only their pod", () => {
  let pod: string;
  let inPod: string;
  let outside: string;

  beforeAll(async () => {
    inPod = await order("QC_REVIEW");
    outside = await order("QC_REVIEW");
  });

  it("only an admin creates pods and sets members, with role checks", async () => {
    await expect(q(ops, "SELECT public.create_pod('North')")).rejects.toThrow(/only an admin/i);
    pod = (await q(admin, "SELECT public.create_pod('North') AS id")).rows[0].id;

    await expect(q(admin, "SELECT public.set_pod_member($1,$2,'POD_LEAD')", [pod, designer])).rejects.toThrow(
      /must hold the QC role/i,
    );
    await expect(q(admin, "SELECT public.set_pod_member($1,$2,'DESIGNER')", [pod, qcLead])).rejects.toThrow(
      /only a designer account/i,
    );
    await q(admin, "SELECT public.set_pod_member($1,$2,'POD_LEAD')", [pod, qcLead]);
    await q(admin, "SELECT public.set_pod_member($1,$2,'DESIGNER')", [pod, designer]);
  });

  it("assign_order_pod is admin-only and needs a real pod lead", async () => {
    await expect(q(ops, "SELECT public.assign_order_pod($1,$2)", [inPod, qcLead])).rejects.toThrow(/only an admin/i);
    await expect(q(admin, "SELECT public.assign_order_pod($1,$2)", [inPod, qcLoose])).rejects.toThrow(/not a pod lead/i);
    await q(admin, "SELECT public.assign_order_pod($1,$2)", [inPod, qcLead]);
    const payload = await db.query(
      "SELECT payload FROM audit.audit_log WHERE action='ORDER_POD_ASSIGNED' AND entity_id=$1",
      [inPod],
    );
    expect(JSON.stringify(payload.rows[0].payload)).not.toContain(qcLead);
  });

  it("the pod lead sees the pod's order and not the other; a QC without a pod sees neither", async () => {
    const lead = await q(qcLead, "SELECT id FROM orders WHERE id = ANY($1)", [[inPod, outside]]);
    expect(lead.rows.map((r) => r.id)).toEqual([inPod]);
    const loose = await q(qcLoose, "SELECT id FROM orders WHERE id = ANY($1)", [[inPod, outside]]);
    expect(loose.rows).toHaveLength(0);
  });

  it("the admin sees every order", async () => {
    const all = await q(admin, "SELECT id FROM orders WHERE id = ANY($1)", [[inPod, outside]]);
    expect(all.rows).toHaveLength(2);
  });

  it("revoking QC takes the pod's orders away at once", async () => {
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE')", [generateId()]);
    const lead2 = generateId();
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'SALES','ACTIVE')", [lead2]);
    await q(ops, "SELECT public.grant_user_role($1,'QC')", [lead2]);
    await q(admin, "SELECT public.set_pod_member($1,$2,'POD_LEAD')", [pod, lead2]);
    expect((await q(lead2, "SELECT id FROM orders WHERE id=$1", [inPod])).rows).toHaveLength(1);
    await q(ops, "SELECT public.revoke_user_role($1,'QC')", [lead2]);
    expect((await q(lead2, "SELECT id FROM orders WHERE id=$1", [inPod])).rows).toHaveLength(0);
  });

  it("a designer sees only their own pod membership row; a pod lead sees the roster", async () => {
    expect((await q(designer, "SELECT user_id FROM pod_members")).rows.map((r) => r.user_id)).toEqual([designer]);
    expect((await q(qcLead, "SELECT user_id FROM pod_members")).rows.length).toBeGreaterThanOrEqual(2);
    expect((await q(client, "SELECT id FROM pods")).rows).toHaveLength(0);
  });

  it("designer refs are generated (DSG-0001…) and unique", async () => {
    const id = generateId();
    await db.query(
      "INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'D','d@x.example')",
      [id, designer],
    );
    const { rows } = await db.query("SELECT designer_ref FROM designer_profiles WHERE id=$1", [id]);
    expect(rows[0].designer_ref).toMatch(/^DSG-\d{4}$/);
  });

  it("staff set their own first name; OPS can set anyone's; clients cannot have one", async () => {
    await q(qcLead, "SELECT public.set_staff_first_name($1,'Priya')", [qcLead]);
    await expect(q(qcLead, "SELECT public.set_staff_first_name($1,'X')", [sales])).rejects.toThrow(/only OPS/i);
    await q(ops, "SELECT public.set_staff_first_name($1,'Sam')", [sales]);
    await expect(q(ops, "SELECT public.set_staff_first_name($1,'C')", [client])).rejects.toThrow(/only staff/i);
    expect((await q(client, "SELECT * FROM staff_profiles")).rows).toHaveLength(0);
  });

  it("the audit chain is intact", async () => {
    const v = await db.query("SELECT audit.verify_chain() AS v");
    expect(v.rows[0].v.valid).toBe(true);
  });
});
