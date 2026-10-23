import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * The visibility matrix of Spec §1, row by row, plus Spec §12.1:
 * "a designer cannot read an unassigned job, a client thread or a price;
 *  a pod lead cannot read another pod."
 */

let db: Client;

const client = generateId();
const otherClient = generateId();
const designer = generateId();
const otherDesigner = generateId();
const leadNorth = generateId();
const leadSouth = generateId();
const admin = generateId();
const finance = generateId();

let mine: string; // assigned to designer, North pod
let unassigned: string; // North pod, no designer
let south: string; // South pod, other designer

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

const rows = async (sub: string, sql: string, params: unknown[] = []) =>
  (await asUser(sub, () => db.query(sql, params))).rows;

async function order(clientId: string, designerId: string | null, lead: string): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, designer_id, product_type, status, currency,
       price_total, designer_payout, qc_payout, platform_commission, designer_payout_paise, qc_payout_paise)
     VALUES ($1,$2,$3,'RING','IN_PROGRESS','USD',5500,0,0,5500,37500,90000)`,
    [id, clientId, designerId],
  );
  await putOrderInPod(db, id, lead);
  return id;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'CLIENT','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'DESIGNER','ACTIVE'),
       ($5,'QC','ACTIVE'), ($6,'QC','ACTIVE'), ($7,'OPS','ACTIVE'), ($8,'FINANCE','ACTIVE')`,
    [client, otherClient, designer, otherDesigner, leadNorth, leadSouth, admin, finance],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES
       ($1,$2,'Dana','dana@x.example'), ($3,$4,'Omar','omar@x.example')`,
    [generateId(), designer, generateId(), otherDesigner],
  );
  await db.query(
    "INSERT INTO client_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'Acme','a@acme.example')",
    [generateId(), client],
  );

  mine = await order(client, designer, leadNorth);
  unassigned = await order(client, null, leadNorth);
  south = await order(otherClient, otherDesigner, leadSouth);

  for (const id of [mine, unassigned, south]) {
    await db.query(
      "INSERT INTO order_screenshots (order_id, object_key, content_type, size_bytes, position, added_by) VALUES ($1,$2,'image/png',1,1,$3)",
      [id, `s/${generateId()}`, admin],
    );
    await db.query(
      "INSERT INTO order_checks (order_id, version, item_id, designer_by, designer_at) VALUES ($1,1,1,$2,now())",
      [id, designer],
    );
    await db.query("INSERT INTO sla_events (order_id, kind) VALUES ($1,'started')", [id]);
  }
  await db.query(
    "INSERT INTO job_assignments (order_id, designer_id, assigned_by) VALUES ($1,$2,$3), ($4,$5,$6)",
    [mine, designer, leadNorth, south, otherDesigner, leadSouth],
  );
  await db.query(
    `INSERT INTO payout_obligations (order_id, payee_id, party, amount_paise) VALUES
       ($1,$2,'DESIGNER',37500), ($1,$3,'QC',90000), ($4,$5,'DESIGNER',37500)`,
    [mine, designer, leadNorth, south, otherDesigner],
  );
  await db.query(
    `INSERT INTO client_credits (client_id, order_id, kind, amount_cents, currency, status, decided_at)
     VALUES ($1,$2,'sla_credit',5500,'USD','pending',NULL), ($1,$3,'sla_credit',5500,'USD','apply_next',now())`,
    [client, mine, unassigned],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describe("designer", () => {
  it("reads only the job assigned to them — not an unassigned job, not another pod's", async () => {
    const jobs = await rows(designer, "SELECT id FROM public.visible_orders()");
    expect(jobs.map((r) => r.id)).toEqual([mine]);
    expect(await rows(designer, "SELECT id FROM orders")).toEqual([]);
  });

  it("never reads a price, a client thread or the client's identity", async () => {
    const [job] = await rows(designer, "SELECT * FROM public.visible_orders()");
    expect(job.price_total).toBeNull();
    expect(job.currency).toBeNull();
    expect(job.qc_payout_paise).toBeNull();
    expect(job.designer_payout_paise).toBe(37500); // their own pay

    const threads = await rows(designer, "SELECT kind FROM message_threads");
    expect(threads.map((t) => t.kind)).toEqual(["internal"]);
    expect(await rows(designer, "SELECT id FROM client_profiles")).toEqual([]);
    expect(await rows(designer, "SELECT user_id FROM client_accounts")).toEqual([]);
    expect(await rows(designer, "SELECT order_id FROM escrow_ledger")).toEqual([]);
  });

  it("never reads the on-behalf screenshots (they show the client's chat)", async () => {
    expect(await rows(designer, "SELECT id FROM order_screenshots")).toEqual([]);
  });

  it("reads their own assignment, checklist and payout — nobody else's", async () => {
    expect((await rows(designer, "SELECT order_id FROM job_assignments")).map((r) => r.order_id)).toEqual([mine]);
    expect((await rows(designer, "SELECT order_id FROM order_checks")).map((r) => r.order_id)).toEqual([mine]);
    expect(await rows(designer, "SELECT order_id, party FROM payout_obligations")).toEqual([
      { order_id: mine, party: "DESIGNER" },
    ]);
    expect(await rows(designer, "SELECT id FROM sla_events")).toEqual([]);
  });

  it("cannot see who ticked or who assigned", async () => {
    await expect(asUser(designer, () => db.query("SELECT designer_by FROM order_checks"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(designer, () => db.query("SELECT assigned_by FROM job_assignments"))).rejects.toThrow(/permission denied/i);
  });
});

describe("pod lead", () => {
  it("reads every order in their pod and none in another pod", async () => {
    const north = await rows(leadNorth, "SELECT id FROM orders ORDER BY id");
    expect(north.map((r) => r.id).sort()).toEqual([mine, unassigned].sort());
    const fromSouth = await rows(leadNorth, "SELECT id FROM orders WHERE id=$1", [south]);
    expect(fromSouth).toEqual([]);
    expect((await rows(leadSouth, "SELECT id FROM orders")).map((r) => r.id)).toEqual([south]);
  });

  it("sees the price (Spec §1) and their own QC pay", async () => {
    const [o] = await rows(leadNorth, "SELECT price_total, qc_payout_paise FROM public.visible_orders($1)", [mine]);
    expect(o).toEqual({ price_total: 5500, qc_payout_paise: 90000 });
    expect(await rows(leadNorth, "SELECT party FROM payout_obligations")).toEqual([{ party: "QC" }]);
  });

  it("reads assignments, checks, screenshots and both threads for their pod only", async () => {
    const pick = async (table: string) =>
      (await rows(leadNorth, `SELECT DISTINCT order_id FROM ${table}`)).map((r) => r.order_id).sort();
    expect(await pick("order_checks")).toEqual([mine, unassigned].sort());
    expect(await pick("order_screenshots")).toEqual([mine, unassigned].sort());
    expect(await pick("job_assignments")).toEqual([mine]);
    const threads = await rows(leadNorth, "SELECT kind FROM message_threads WHERE order_id=$1 ORDER BY kind", [mine]);
    expect(threads.map((t) => t.kind)).toEqual(["client_team", "internal"]);
    expect(await rows(leadNorth, "SELECT id FROM message_threads WHERE order_id=$1", [south])).toEqual([]);
  });

  it("sees the client's code (reference only), never their profile", async () => {
    // Codes were minted when the orders left DRAFT: Acme → AC1; no profile → CL1.
    expect(await rows(leadNorth, "SELECT client_code FROM client_accounts")).toEqual([{ client_code: "AC1" }]);
    expect(await rows(leadNorth, "SELECT id FROM client_profiles")).toEqual([]);
    expect(await rows(leadSouth, "SELECT client_code FROM client_accounts")).toEqual([{ client_code: "CL1" }]);
  });
});

describe("client", () => {
  it("reads own orders with prices, never the designer's identity", async () => {
    const own = await rows(client, "SELECT id, price_total FROM orders ORDER BY id");
    expect(own.map((r) => r.id).sort()).toEqual([mine, unassigned].sort());
    expect(await rows(client, "SELECT id FROM designer_profiles")).toEqual([]);
    expect(await rows(client, "SELECT order_id FROM job_assignments")).toEqual([]);
    expect(await rows(client, "SELECT order_id FROM order_checks")).toEqual([]);
  });

  it("sees a credit only once an admin has decided it", async () => {
    expect(await rows(client, "SELECT order_id, status FROM client_credits")).toEqual([
      { order_id: unassigned, status: "apply_next" },
    ]);
    expect(await rows(otherClient, "SELECT id FROM client_credits")).toEqual([]);
  });

  it("reads only the client_team thread", async () => {
    const threads = await rows(client, "SELECT kind FROM message_threads WHERE order_id=$1", [mine]);
    expect(threads).toEqual([{ kind: "client_team" }]);
  });
});

describe("admin and finance", () => {
  it("admin reads every order, credit and obligation", async () => {
    expect((await rows(admin, "SELECT id FROM orders")).length).toBe(3);
    expect((await rows(admin, "SELECT id FROM client_credits")).length).toBe(2);
    expect((await rows(admin, "SELECT id FROM payout_obligations")).length).toBe(3);
  });

  it("finance alone reads money, not every order", async () => {
    expect((await rows(finance, "SELECT id FROM payout_obligations")).length).toBe(3);
    expect((await rows(finance, "SELECT id FROM client_credits")).length).toBe(2);
    expect(await rows(finance, "SELECT id FROM orders WHERE status='IN_PROGRESS'")).toEqual([]);
  });
});
