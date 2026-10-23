import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 2 (0040): the quote, order confirmation and the 6-hour clock —
 * DECISIONS §4–§6 as changed in v1.1 (clock = paid AND confirmed).
 */

let db: Client;

const admin = generateId(); // OPS + SALES + FINANCE
const sales = generateId();
const podLead = generateId();
const otherLead = generateId();
const client = generateId();
const client2 = generateId();

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

async function submitted(owner = client): Promise<string> {
  const id = generateId();
  await q(owner, "SELECT public.create_order($1,'RING','USD')", [id]);
  await q(owner, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
  await putOrderInPod(db, id, podLead);
  return id;
}

async function quote(id: string, category: string, price: number | null = null, hours: number | null = null) {
  return (
    await q(admin, "SELECT public.quote_order_v2($1,$2,$3,$4) AS r", [id, category, price, hours])
  ).rows[0].r;
}

async function payByCard(id: string): Promise<void> {
  const { rows } = await db.query("SELECT price_total FROM orders WHERE id=$1", [id]);
  const ref = `order_rp_${id}`;
  await db.query("SELECT public.open_payment_intent($1,$2)", [id, ref]);
  await db.query("SELECT public.confirm_payment($1,$2,'USD',$3,$4)", [ref, rows[0].price_total, `k:${ref}`, `pay_${id}`]);
}

const order = async (id: string) =>
  (
    await db.query(
      `SELECT status, price_total, category, tier, designer_payout_paise, qc_payout_paise,
              paid_at, confirmed_at, sla_status, sla_started_at, sla_due_at, first_look_at, payment_method,
              extract(epoch FROM sla_due_at - sla_started_at)::int AS window_s
       FROM orders WHERE id=$1`,
      [id],
    )
  ).rows[0];

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'SALES','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'QC','ACTIVE'),
       ($5,'CLIENT','ACTIVE'), ($6,'CLIENT','ACTIVE')`,
    [admin, sales, podLead, otherLead, client, client2],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  const other = await db.query("INSERT INTO pods (name) VALUES ('South') RETURNING id");
  await db.query("INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'POD_LEAD')", [
    other.rows[0].id, otherLead,
  ]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("pay (DECISIONS §5)", () => {
  it("QC pay: $20 → ₹500, $30 → ₹500, $55 → ₹900, $60 → ₹1,000, $85 → ₹1,400, $180 → ₹3,000", async () => {
    const { rows } = await db.query(
      "SELECT c, app.qc_pay_paise(c) AS p FROM unnest(ARRAY[2000,3000,5500,6000,8500,18000]) c",
    );
    expect(rows.map((r) => r.p / 100)).toEqual([500, 500, 900, 1000, 1400, 3000]);
  });

  it("designer pay is locked from the category: D → ₹500, L → ₹4,000", async () => {
    const d = await submitted(client2);
    const l = await submitted(client2);
    expect((await quote(d, "D")).designer_payout_paise).toBe(50000);
    expect((await quote(l, "L", 30000, 48)).designer_payout_paise).toBe(400000);
  });

  it("a rate change reaches only orders quoted after it", async () => {
    const before = await submitted(client2);
    await quote(before, "D");
    await q(admin, "SELECT public.set_category_rate('D', 60000)");
    const after = await submitted(client2);
    await quote(after, "D");
    await q(admin, "SELECT public.set_category_rate('D', 50000)");
    expect((await order(before)).designer_payout_paise).toBe(50000);
    expect((await order(after)).designer_payout_paise).toBe(60000);
  });
});

describe("quote (DECISIONS §4)", () => {
  it("first design: $49 once per account, then the band price", async () => {
    const first = await submitted();
    const r1 = await quote(first, "C");
    expect(r1.price_total).toBe(4900);
    expect(r1.first_design).toBe(true);

    const second = await submitted();
    const r2 = await quote(second, "C");
    expect(r2.price_total).toBe(5500); // a C job defaults to $55
    expect(r2.first_design).toBe(false);
  });

  it("D–F default to $85; G–L need a deadline and default to from $120", async () => {
    expect((await quote(await submitted(client2), "E")).price_total).toBe(8500);
    const g = await submitted(client2);
    await expect(quote(g, "G")).rejects.toThrow(/needs a deadline/i);
    const r = await quote(g, "G", null, 24);
    expect(r.price_total).toBe(12000);
    expect(r.tier).toBe("complex");
  });

  it("admin can override the price; payouts above 40% warn", async () => {
    const id = await submitted(client2);
    const r = await quote(id, "F", 3000); // F pays ₹1,000 + QC ₹500 = ₹1,500 ≈ $17.86 on a $30 order
    expect(r.price_total).toBe(3000);
    expect(r.warning).toMatch(/limit 40%/);
    expect((await quote(await submitted(client2), "A", 5500)).warning).toBeNull();
  });

  it("only SALES (or an admin) quotes; a category is needed", async () => {
    const id = await submitted(client2);
    await expect(q(podLead, "SELECT public.quote_order_v2($1,'C')", [id])).rejects.toThrow(/only SALES/i);
    await expect(q(sales, "SELECT public.quote_order_v2($1)", [id])).rejects.toThrow(/set a category/i);
    await q(sales, "SELECT public.quote_order_v2($1,'B')", [id]);
  });

  it("the pod lead of the order's pod may set the category; another pod lead may not", async () => {
    const id = await submitted(client2);
    await expect(q(otherLead, "SELECT public.set_order_category($1,'B')", [id])).rejects.toThrow(/pod lead/i);
    await q(podLead, "SELECT public.set_order_category($1,'H')", [id]);
    expect((await order(id)).tier).toBe("complex");
  });
});

describe("clock: paid AND confirmed (DECISIONS §6, v1.1)", () => {
  it("paid first: the clock waits for confirmation, then runs 6 hours for D", async () => {
    const id = await submitted();
    await quote(id, "D");
    await payByCard(id);
    let o = await order(id);
    expect(o.paid_at).not.toBeNull();
    expect(o.payment_method).toBe("razorpay");
    expect(o.sla_status).toBe("pending");

    await q(podLead, "SELECT public.confirm_order($1)", [id]);
    o = await order(id);
    expect(o.sla_status).toBe("running");
    expect(o.window_s).toBe(6 * 3600);
    expect(new Date(o.sla_started_at).getTime()).toBe(new Date(o.confirmed_at).getTime());
  });

  it("confirmed first: the clock starts at payment; H runs for its deadline", async () => {
    const id = await submitted(client2);
    await quote(id, "H", 24000, 36);
    await q(admin, "SELECT public.confirm_order($1)", [id]);
    expect((await order(id)).sla_status).toBe("pending");
    await payByCard(id);
    const o = await order(id);
    expect(o.sla_status).toBe("running");
    expect(o.window_s).toBe(36 * 3600);
    expect(new Date(o.sla_started_at).getTime()).toBe(new Date(o.paid_at).getTime());
  });

  it("only an admin or this order's pod lead confirms; confirming twice changes nothing", async () => {
    const id = await submitted(client2);
    await expect(q(otherLead, "SELECT public.confirm_order($1)", [id])).rejects.toThrow(/pod lead/i);
    await expect(q(client2, "SELECT public.confirm_order($1)", [id])).rejects.toThrow(/pod lead/i);
    await q(podLead, "SELECT public.confirm_order($1)", [id]);
    const again = await q(podLead, "SELECT public.confirm_order($1) AS r", [id]);
    expect(again.rows[0].r.changed).toBe(false);
  });

  it("admin marks a Wise payment received: it counts as paid, with method and reference", async () => {
    const id = await submitted(client2);
    await quote(id, "C");
    await expect(q(sales, "SELECT public.mark_payment_received($1,'wise','W-1')", [id])).rejects.toThrow(/only FINANCE/i);
    await expect(q(admin, "SELECT public.mark_payment_received($1,'cash')", [id])).rejects.toThrow(/method must be/i);
    await q(admin, "SELECT public.mark_payment_received($1,'wise','WISE-REF-77')", [id]);
    const o = await order(id);
    expect(o.status).toBe("PAYMENT_HELD");
    expect(o.payment_method).toBe("wise");
    expect(o.paid_at).not.toBeNull();
    await q(admin, "SELECT public.confirm_order($1)", [id]);
    expect((await order(id)).sla_status).toBe("running");
  });
});

describe("met, missed and credits", () => {
  async function running(category = "D", owner = client2, price: number | null = null, hours: number | null = null) {
    const id = await submitted(owner);
    await quote(id, category, price, hours);
    await payByCard(id);
    await q(admin, "SELECT public.confirm_order($1)", [id]);
    return id;
  }

  it("first look one minute before the deadline (5:59) is met", async () => {
    const id = await running();
    await db.query("UPDATE orders SET sla_due_at = now() + interval '1 minute' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET status='CLIENT_PREVIEW' WHERE id=$1", [id]);
    const o = await order(id);
    expect(o.first_look_at).not.toBeNull();
    expect(o.sla_status).toBe("met");
    await db.query("SELECT public.sla_sweep(now() + interval '1 hour')");
    expect((await order(id)).sla_status).toBe("met");
  });

  it("a miss (6:01) is flagged once and creates exactly one pending credit, even if the sweep runs twice", async () => {
    const id = await running();
    await db.query("UPDATE orders SET sla_due_at = now() - interval '1 minute' WHERE id=$1", [id]);
    await db.query("SELECT public.sla_sweep()");
    await db.query("SELECT public.sla_sweep()");
    expect((await order(id)).sla_status).toBe("breached");
    const credits = await db.query("SELECT status, amount_cents FROM client_credits WHERE order_id=$1", [id]);
    expect(credits.rows).toEqual([{ status: "pending", amount_cents: 8500 }]); // D is in the $85 band
    // A late first look does not turn a breach into "met".
    await db.query("UPDATE orders SET status='CLIENT_PREVIEW' WHERE id=$1", [id]);
    expect((await order(id)).sla_status).toBe("breached");
  });

  it("a complex miss is flagged with no credit", async () => {
    const id = await running("H", client2, 24000, 36);
    await db.query("UPDATE orders SET sla_due_at = now() - interval '1 minute' WHERE id=$1", [id]);
    await db.query("SELECT public.sla_sweep()");
    expect((await order(id)).sla_status).toBe("breached");
    expect((await db.query("SELECT 1 FROM client_credits WHERE order_id=$1", [id])).rows).toHaveLength(0);
  });

  it("an order that is not both paid and confirmed is never swept", async () => {
    const id = await submitted(client2);
    await quote(id, "D");
    await payByCard(id); // paid, never confirmed
    await db.query("SELECT public.sla_sweep(now() + interval '2 days')");
    expect((await order(id)).sla_status).toBe("pending");
    expect((await db.query("SELECT 1 FROM client_credits WHERE order_id=$1", [id])).rows).toHaveLength(0);
  });

  it("the sweep cannot be called by app users", async () => {
    await expect(q(admin, "SELECT public.sla_sweep()")).rejects.toThrow(/permission denied/i);
  });

  it("admin decides a credit once; partial and reject need a reason; the client sees it only once decided", async () => {
    const id = await running("D", client);
    await db.query("UPDATE orders SET sla_due_at = now() - interval '1 minute' WHERE id=$1", [id]);
    await db.query("SELECT public.sla_sweep()");
    const { rows } = await db.query("SELECT id FROM client_credits WHERE order_id=$1", [id]);
    const credit = rows[0].id as string;

    expect((await q(client, "SELECT id FROM client_credits WHERE order_id=$1", [id])).rows).toHaveLength(0);
    const queue = await q(admin, "SELECT order_ref, amount_cents FROM public.pending_sla_credits() WHERE credit_id=$1", [credit]);
    expect(queue.rows[0].amount_cents).toBe(8500);

    await expect(q(podLead, "SELECT public.decide_sla_credit($1,'apply_next')", [credit])).rejects.toThrow(/only an admin/i);
    await expect(q(admin, "SELECT public.decide_sla_credit($1,'partial',2000)", [credit])).rejects.toThrow(/needs a reason/i);
    await expect(q(admin, "SELECT public.decide_sla_credit($1,'partial',8500,'too much')", [credit])).rejects.toThrow(/less than/i);

    await q(admin, "SELECT public.decide_sla_credit($1,'partial',2000,'brief arrived incomplete')", [credit]);
    await expect(q(admin, "SELECT public.decide_sla_credit($1,'apply_next')", [credit])).rejects.toThrow(/already decided/i);

    const seen = await q(client, "SELECT status, decided_amount_cents FROM client_credits WHERE order_id=$1", [id]);
    expect(seen.rows).toEqual([{ status: "partial", decided_amount_cents: 2000 }]);
    expect((await order(id)).sla_status).toBe("breached_credited");
    const note = await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='CREDIT'", [client]);
    expect(note.rows).toHaveLength(1);
  });

  it("with auto_sla_credit on, the credit is created already decided as apply-to-next-order", async () => {
    await q(admin, "SELECT public.set_feature_flag('auto_sla_credit', true)");
    const id = await running();
    await db.query("UPDATE orders SET sla_due_at = now() - interval '1 minute' WHERE id=$1", [id]);
    await db.query("SELECT public.sla_sweep()");
    await q(admin, "SELECT public.set_feature_flag('auto_sla_credit', false)");
    const c = await db.query("SELECT status, decided_amount_cents FROM client_credits WHERE order_id=$1", [id]);
    expect(c.rows).toEqual([{ status: "apply_next", decided_amount_cents: 8500 }]);
  });

  it("the client sees confirmation and the clock on their order, and the audit chain holds", async () => {
    const id = await running("D", client);
    const { rows } = await q(client, "SELECT confirmed_at, paid_at, sla_status, sla_due_at FROM public.visible_orders($1)", [id]);
    expect(rows[0].sla_status).toBe("running");
    expect(rows[0].confirmed_at).not.toBeNull();
    const v = await db.query("SELECT audit.verify_chain() AS v");
    expect(v.rows[0].v.valid).toBe(true);
  });
});
