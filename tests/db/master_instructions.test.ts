import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0062 — master instructions and diamond certificates (owner, 5 Nov 2026).
 * A client writes their factory's standing requirements once; everyone who
 * may see one of their orders reads them there, and nobody else. A
 * certificate picture rides on an order like a reference picture.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const ops = id("ops");
const lead = id("lead");
const otherLead = id("lead2");
const client = id("client");
const otherClient = id("client2");
const designer = id("designer");
const otherDesigner = id("designer2");
const order = `ord_${Math.random().toString(36).slice(2, 10)}`;
const draft = `ord_${Math.random().toString(36).slice(2, 10)}`;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'QC','ACTIVE'),
       ($5,'CLIENT','ACTIVE'), ($6,'CLIENT','ACTIVE'), ($7,'DESIGNER','ACTIVE'), ($8,'DESIGNER','ACTIVE')`,
    [admin, ops, lead, otherLead, client, otherClient, designer, otherDesigner],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  const pod = (await db.query("INSERT INTO pods (name) VALUES ('Mi North') RETURNING id")).rows[0].id;
  const pod2 = (await db.query("INSERT INTO pods (name) VALUES ('Mi South') RETURNING id")).rows[0].id;
  await db.query(
    "INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER'), ($4,$5,'POD_LEAD')",
    [pod, lead, designer, pod2, otherLead],
  );
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout, platform_commission, pod_id, designer_id)
     VALUES ($1,$2,'CAD_MODEL','IN_PROGRESS','USD',10000,6000,1000,3000,$3,$4),
            ($5,$2,'CAD_MODEL','DRAFT','USD',10000,6000,1000,3000,NULL,NULL)`,
    [order, client, pod, designer, draft],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

async function as<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  await db.query("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

const setMine = (who: string, body: string) => as(who, () => db.query("SELECT public.set_master_instructions($1) AS r", [body]));
const forOrder = async (who: string, o = order) =>
  (await as(who, () => db.query("SELECT body FROM public.order_master_instructions($1)", [o]))).rows.map((r) => r.body as string);

describe("master instructions", () => {
  it("only a client writes their own; staff and designers cannot", async () => {
    for (const who of [ops, lead, designer]) {
      await expect(setMine(who, "Shank 1.8 mm")).rejects.toThrow(/belong to a client/);
    }
    expect((await setMine(client, "  Shank 1.8 mm minimum.\nCasting allowance 0.1 mm.  ")).rows[0].r).toBe(
      "Shank 1.8 mm minimum.\nCasting allowance 0.1 mm.",
    );
    const mine = (await as(client, () => db.query("SELECT body FROM public.my_master_instructions()"))).rows;
    expect(mine).toEqual([{ body: "Shank 1.8 mm minimum.\nCasting allowance 0.1 mm." }]);
  });

  it("is shown on the order to the client, the assigned designer, the pod lead and admins", async () => {
    for (const who of [client, designer, lead, admin]) {
      expect(await forOrder(who)).toEqual(["Shank 1.8 mm minimum.\nCasting allowance 0.1 mm."]);
    }
  });

  it("is not shown to anyone else, and the table cannot be read directly", async () => {
    for (const who of [otherClient, otherDesigner, otherLead]) {
      expect(await forOrder(who)).toEqual([]);
    }
    await expect(as(designer, () => db.query("SELECT body FROM client_master_instructions"))).rejects.toThrow(/permission denied/);
    // Another client's own read is their own (empty), never this one.
    expect((await as(otherClient, () => db.query("SELECT body FROM public.my_master_instructions()"))).rows).toEqual([]);
  });

  it("an admin may write it for a client; others may not", async () => {
    await expect(as(lead, () => db.query("SELECT public.set_master_instructions('x', $1)", [otherClient]))).rejects.toThrow(/only an admin/);
    await expect(as(admin, () => db.query("SELECT public.set_master_instructions('x', $1)", [designer]))).rejects.toThrow(/no such client/);
    await as(admin, () => db.query("SELECT public.set_master_instructions('Prongs 0.9 mm', $1)", [otherClient]));
    const row = (await db.query("SELECT body, updated_by FROM client_master_instructions WHERE client_id = $1", [otherClient])).rows[0];
    expect(row).toEqual({ body: "Prongs 0.9 mm", updated_by: admin });
  });

  it("an admin may write it from an order's page; a pod lead may not", async () => {
    await expect(as(lead, () => db.query("SELECT public.set_order_master_instructions($1, 'x')", [order]))).rejects.toThrow(/only an admin/);
    await as(admin, () => db.query("SELECT public.set_order_master_instructions($1, 'Sprue inside the shank')", [order]));
    expect(await forOrder(designer)).toEqual(["Sprue inside the shank"]);
  });

  it("an empty text clears it, and it stays within 4000 characters", async () => {
    await expect(setMine(client, "x".repeat(4001))).rejects.toThrow(/4000/);
    await setMine(client, "   ");
    expect(await forOrder(designer)).toEqual([]);
  });
});

const add = (who: string, o: string, key = `${o}/certs/${Math.random().toString(36).slice(2)}.jpg`) =>
  as(who, () => db.query("SELECT public.add_stone_certificate($1,$2,'image/jpeg',1234) AS id", [o, key]));
const certs = async (who: string, o: string) =>
  (await as(who, () => db.query("SELECT id FROM public.order_stone_certificates_for($1)", [o]))).rows.map((r) => r.id as string);

describe("diamond certificates", () => {
  it("the client adds one to their open brief, under the order's folder", async () => {
    const { id: cert } = (await add(client, draft)).rows[0];
    expect(await certs(client, draft)).toEqual([cert]);
    await expect(add(client, draft, `${order}/certs/x.jpg`)).rejects.toThrow(/not stored under this order/);
    await expect(add(otherClient, draft)).rejects.toThrow(/only the client/);
    await expect(add(designer, draft)).rejects.toThrow(/only the client/);
  });

  it("is fixed once the order is quoted", async () => {
    await expect(add(client, order)).rejects.toThrow(/fixed once the order has been quoted/);
  });

  it("is read by everyone on the order and nobody else", async () => {
    await db.query("INSERT INTO order_stone_certificates (order_id, object_key, content_type, size_bytes) VALUES ($1, $1 || '/certs/a.png', 'image/png', 10)", [order]);
    for (const who of [client, designer, lead, admin]) expect(await certs(who, order)).toHaveLength(1);
    for (const who of [otherClient, otherDesigner, otherLead]) expect(await certs(who, order)).toEqual([]);
    await expect(as(client, () => db.query("SELECT id FROM order_stone_certificates"))).rejects.toThrow(/permission denied/);
  });

  it("PNG, JPEG or PDF (0063), and up to five", async () => {
    await expect(
      as(client, () => db.query("SELECT public.add_stone_certificate($1, $1 || '/certs/a.gif', 'image/gif', 10)", [draft])),
    ).rejects.toThrow(/content_type/);
    await as(client, () => db.query("SELECT public.add_stone_certificate($1, $1 || '/certs/b.pdf', 'application/pdf', 10)", [draft]));
    for (let i = 0; i < 3; i++) await add(client, draft);
    await expect(add(client, draft)).rejects.toThrow(/up to 5/);
  });

  it("the client removes one and gets its key back for the bytes", async () => {
    const [first] = await certs(client, draft);
    await expect(as(otherClient, () => db.query("SELECT public.remove_stone_certificate($1)", [first]))).rejects.toThrow(/only the client/);
    const key = (await as(client, () => db.query("SELECT public.remove_stone_certificate($1) AS k", [first]))).rows[0].k as string;
    expect(key.startsWith(`${draft}/certs/`)).toBe(true);
    expect(await certs(client, draft)).toHaveLength(4);
  });
});
