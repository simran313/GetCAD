import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * 0065 (owner, 7 Nov 2026): designer pay is category minutes × ₹8 a minute,
 * an admin may set one designer's own rate, the pod lead sees the rates of
 * their pod and cannot change them, a designer never sees a rate; pod pay is
 * 50 % of the designer's pay, at least ₹300; pay follows the assigned designer.
 */
let db: Client;
const admin = generateId();
const podLead = generateId();
const otherLead = generateId();
const dana = generateId();
const ravi = generateId();
const outsider = generateId();
const client = generateId();
let pod: string;

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

async function makeAssignable(id: string) {
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at, agreement_version)
     VALUES ($1,$2,'Designer','d@x.example', now(), (SELECT version FROM app.current_agreement('DESIGNER')))`,
    [generateId(), id],
  );
  await db.query(
    `INSERT INTO agreement_acceptances (agreement_id, user_id, content_sha256)
     SELECT id, $1, content_sha256 FROM app.current_agreement('DESIGNER')`,
    [id],
  );
}

/** A paid category-F job (120 minutes) in the North pod, quoted at the standard rate. */
async function job(): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout,
                         platform_commission, category, tier, pod_id, pod_lead_id, job_code, sla_due_at,
                         designer_payout_paise, qc_payout_paise)
     VALUES ($1,$2,'RING','PAYMENT_HELD','USD',8500,0,0,8500,'F','standard',$3,$4,
             'RN-C-' || floor(random()*10000)::int, now() + interval '6 hours', 96000, 48000)`,
    [id, client, pod, podLead],
  );
  return id;
}
const pay = async (id: string) =>
  (await db.query("SELECT designer_payout_paise AS d, qc_payout_paise AS p FROM orders WHERE id=$1", [id])).rows[0];

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'QC','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'DESIGNER','ACTIVE'),
       ($5,'DESIGNER','ACTIVE'), ($6,'DESIGNER','ACTIVE'), ($7,'CLIENT','ACTIVE')`,
    [admin, podLead, otherLead, dana, ravi, outsider, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  for (const d of [dana, ravi, outsider]) await makeAssignable(d);
  pod = (await db.query("INSERT INTO pods (name) VALUES ('North') RETURNING id")).rows[0].id;
  const south = (await db.query("INSERT INTO pods (name) VALUES ('South') RETURNING id")).rows[0].id;
  await db.query(
    `INSERT INTO pod_members (pod_id, user_id, member_role) VALUES
       ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER'), ($1,$4,'DESIGNER'), ($5,$6,'POD_LEAD'), ($5,$7,'DESIGNER')`,
    [pod, podLead, dana, ravi, south, otherLead, outsider],
  );
});

afterAll(async () => {
  await db?.end();
});

describe("designer rates", () => {
  it("are ₹8 a minute for everyone until an admin sets one designer's own", async () => {
    const all = (await q(admin, "SELECT designer_id, paise_per_minute, is_custom FROM public.team_designer_rates()")).rows;
    expect(all).toHaveLength(3);
    expect(all.every((r) => r.paise_per_minute === 800 && r.is_custom === false)).toBe(true);

    await q(admin, "SELECT public.set_designer_rate($1, 1000)", [dana]);
    const mine = (await q(admin, "SELECT paise_per_minute, is_custom FROM public.team_designer_rates() WHERE designer_id=$1", [dana])).rows;
    expect(mine).toEqual([{ paise_per_minute: 1000, is_custom: true }]);
    const log = await db.query("SELECT payload FROM audit.audit_log WHERE action='DESIGNER_RATE_SET' AND entity_id=$1", [dana]);
    expect(log.rows.at(-1)!.payload).toMatchObject({ before_paise_per_minute: null, after_paise_per_minute: 1000 });
  });

  it("only an admin sets a rate, and only a designer's", async () => {
    await expect(q(podLead, "SELECT public.set_designer_rate($1, 900)", [ravi])).rejects.toThrow(/only an admin/i);
    await expect(q(dana, "SELECT public.set_designer_rate($1, 5000)", [dana])).rejects.toThrow(/only an admin/i);
    await expect(q(admin, "SELECT public.set_designer_rate($1, 900)", [client])).rejects.toThrow(/not a designer/i);
    await expect(q(admin, "SELECT public.set_designer_rate($1, 0)", [ravi])).rejects.toThrow(/between/i);
  });

  it("the pod lead sees their pod's rates, not another pod's; a designer and a client see none", async () => {
    const lead = (await q(podLead, "SELECT designer_id FROM public.team_designer_rates() ORDER BY designer_id")).rows;
    expect(lead.map((r) => r.designer_id).sort()).toEqual([dana, ravi].sort());
    expect((await q(otherLead, "SELECT designer_id FROM public.team_designer_rates()")).rows).toEqual([{ designer_id: outsider }]);
    expect((await q(dana, "SELECT * FROM public.team_designer_rates()")).rows).toEqual([]);
    expect((await q(client, "SELECT * FROM public.team_designer_rates()")).rows).toEqual([]);
    await expect(q(podLead, "SELECT * FROM designer_rates")).rejects.toThrow(/permission denied/i);
    await expect(q(dana, "SELECT * FROM designer_rates")).rejects.toThrow(/permission denied/i);
  });
});

describe("pay follows the assigned designer", () => {
  it("assigning sets the pay at that designer's rate; moving the job sets it again; audited", async () => {
    const id = await job();
    expect(await pay(id)).toEqual({ d: 96000, p: 48000 }); // F: 120 min × ₹8, pod half

    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]); // ₹10 a minute
    expect(await pay(id)).toEqual({ d: 120000, p: 60000 });

    await q(podLead, "SELECT public.reassign_job($1,$2)", [id, ravi]); // standard ₹8
    expect(await pay(id)).toEqual({ d: 96000, p: 48000 });

    const log = await db.query("SELECT payload FROM audit.audit_log WHERE action='ORDER_PAY_SET' AND entity_id=$1 ORDER BY seq", [id]);
    expect(log.rows.map((r) => r.payload.designer_payout_paise)).toEqual([
      { from: 96000, to: 120000 },
      { from: 120000, to: 96000 },
    ]);
  });

  it("a rate set later reaches only jobs assigned after it", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, ravi]);
    await q(admin, "SELECT public.set_designer_rate($1, 1200)", [ravi]);
    expect(await pay(id)).toEqual({ d: 96000, p: 48000 });
    await q(admin, "SELECT public.set_designer_rate($1, NULL)", [ravi]); // back to standard
    expect((await q(admin, "SELECT is_custom FROM public.team_designer_rates() WHERE designer_id=$1", [ravi])).rows).toEqual([{ is_custom: false }]);
  });

  it("a free fix job (no designer pay) stays free when assigned", async () => {
    const id = await job();
    await db.query("UPDATE orders SET designer_payout_paise = 0, qc_payout_paise = 30000 WHERE id=$1", [id]);
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    expect(await pay(id)).toEqual({ d: 0, p: 30000 });
  });

  it("the designer sees their own pay only; the pod lead the designer's and the pod's, never the price", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    const [d] = (await q(dana, "SELECT price_total, currency, designer_payout_paise, qc_payout_paise FROM public.visible_orders($1)", [id])).rows;
    expect(d).toEqual({ price_total: null, currency: null, designer_payout_paise: 120000, qc_payout_paise: null });
    const [l] = (await q(podLead, "SELECT price_total, currency, designer_payout_paise, qc_payout_paise FROM public.visible_orders($1)", [id])).rows;
    expect(l).toEqual({ price_total: null, currency: null, designer_payout_paise: 120000, qc_payout_paise: 60000 });
    const [a] = (await q(admin, "SELECT price_total FROM public.visible_orders($1)", [id])).rows;
    expect(a).toEqual({ price_total: 8500 });
    const [pj] = (await q(admin, "SELECT price_total FROM public.pod_jobs($1)", [id])).rows;
    expect(pj).toEqual({ price_total: 8500 });
  });
});
