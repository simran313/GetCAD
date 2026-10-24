import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 5b (0046): quotes are always in US dollars (a portal draft used to
 * be INR, so $55 = 5500 would have been charged as ₹55), the client picks the
 * service on their draft, and the Messages screen's conversation list.
 */

let db: Client;

const admin = generateId();
const client = generateId();
const other = generateId();
const designer = generateId();
const podLead = generateId();

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

async function submitted(currency: string): Promise<string> {
  const id = generateId();
  await q(client, "SELECT public.create_order($1,'RING',$2)", [id, currency]);
  await q(client, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
  return id;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'CLIENT','ACTIVE'), ($4,'DESIGNER','ACTIVE'), ($5,'QC','ACTIVE')`,
    [admin, client, other, designer, podLead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran')", [podLead]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("quotes are in US dollars", () => {
  it("an INR draft is quoted, and would be charged, in USD", async () => {
    const id = await submitted("INR");
    await q(admin, "SELECT public.quote_order_v2($1,'C')", [id]);
    const o = await db.query("SELECT currency, price_total FROM orders WHERE id=$1", [id]);
    expect(o.rows[0]).toEqual({ currency: "USD", price_total: 4900 });
  });

  it("a USD order stays USD", async () => {
    const id = await submitted("USD");
    await q(admin, "SELECT public.quote_order_v2($1,'D')", [id]);
    expect((await db.query("SELECT currency FROM orders WHERE id=$1", [id])).rows[0].currency).toBe("USD");
  });
});

describe("the client sets the service on their draft", () => {
  it("own draft only, and only until quoted", async () => {
    const id = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
    await q(client, "SELECT public.set_order_service($1,'render')", [id]);
    expect((await db.query("SELECT service FROM orders WHERE id=$1", [id])).rows[0].service).toBe("render");

    await expect(q(other, "SELECT public.set_order_service($1,'cad')", [id])).rejects.toThrow(/order not found/i);
    await db.query("UPDATE orders SET status='QUOTED' WHERE id=$1", [id]);
    await expect(q(client, "SELECT public.set_order_service($1,'cad')", [id])).rejects.toThrow(/fixed once/i);
  });
});

describe("submit_brief (N5): the DECISIONS §11 minimum before sending", () => {
  it("names what is missing, then sends once it is there", async () => {
    const id = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
    await expect(q(client, "SELECT public.submit_brief($1)", [id])).rejects.toThrow(/still needs: product, reference, size, metal/i);

    await q(
      client,
      `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Halo', p_product => 'RING', p_metal => 'WHITE')`,
      [id],
    );
    await expect(q(client, "SELECT public.submit_brief($1)", [id])).rejects.toThrow(/still needs: reference, size/i);

    await q(client, "SELECT public.add_reference_image($1,$2,'image/png',100)", [id, `${id}/refs/${generateId()}.png`]);
    await q(
      client,
      `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Halo', p_product => 'RING', p_metal => 'WHITE', p_ring_size => 'US 6.5')`,
      [id],
    );
    const r = await q(client, "SELECT public.submit_brief($1) AS r", [id]);
    expect(r.rows[0].r.to).toBe("SUBMITTED");
    await expect(q(client, "SELECT public.submit_brief($1)", [id])).rejects.toThrow(/already sent/i);
  });

  it("does not ask a render order for a size; only the client sends", async () => {
    const id = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
    await q(client, "SELECT public.set_order_service($1,'render')", [id]);
    await q(client, `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Renders', p_product => 'RING', p_metal => 'ROSE')`, [id]);
    await q(client, "SELECT public.add_reference_image($1,$2,'image/png',100)", [id, `${id}/refs/${generateId()}.png`]);
    await expect(q(other, "SELECT public.submit_brief($1)", [id])).rejects.toThrow(/order not found/i);
    const r = await q(client, "SELECT public.submit_brief($1) AS r", [id]);
    expect(r.rows[0].r.to).toBe("SUBMITTED");
  });
});

describe("my_conversations (C7)", () => {
  it("lists what each person may read, newest first, with the last message", async () => {
    const a = await submitted("USD");
    const b = await submitted("USD");
    for (const id of [a, b]) {
      await putOrderInPod(db, id, podLead);
      await db.query("UPDATE orders SET designer_id=$2 WHERE id=$1", [id, designer]);
    }
    const thread = async (id: string, kind: string) =>
      (await db.query("SELECT id FROM message_threads WHERE order_id=$1 AND kind=$2", [id, kind])).rows[0].id;

    await q(client, "SELECT public.post_thread_message($1,'First on A')", [await thread(a, "client_team")]);
    await q(podLead, "SELECT public.post_thread_message($1,'Reply on B')", [await thread(b, "client_team")]);
    await q(podLead, "SELECT public.post_thread_message($1,'Prongs 0.8')", [await thread(a, "internal")]);

    const all = await q(client, "SELECT order_id, kind, last_body, last_mine, last_alias, messages FROM public.my_conversations()");
    // Newest message first; conversations with no messages yet come after.
    expect(all.rows.slice(0, 2).map((r) => r.order_id)).toEqual([b, a]);
    const forClient = { rows: all.rows.filter((r) => r.order_id === a || r.order_id === b) };
    expect(forClient.rows.map((r) => [r.order_id, r.kind])).toEqual([
      [b, "client_team"],
      [a, "client_team"],
    ]);
    expect(forClient.rows[0]).toMatchObject({ last_body: "Reply on B", last_mine: false, last_alias: "Team · Simran", messages: 1 });
    expect(forClient.rows[1]).toMatchObject({ last_body: "First on A", last_mine: true });

    const forDesigner = await q(designer, "SELECT order_id, kind, display_ref FROM public.my_conversations()");
    expect(forDesigner.rows.every((r) => r.kind === "internal")).toBe(true);
    expect(forDesigner.rows[0].order_id).toBe(a);
    // Designers see the job code, never the client's reference.
    expect(forDesigner.rows[0].display_ref).toMatch(/^RN-C-\d+$/);

    const forOther = await q(other, "SELECT * FROM public.my_conversations()");
    expect(forOther.rows).toEqual([]);
  });
});
