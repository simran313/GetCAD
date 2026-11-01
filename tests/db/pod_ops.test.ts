import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * Phase 13c (0058): the pod lead moves work between designers, escalates to
 * admins, and reads an attributed activity record; overdue alerts go out
 * once. Scope: a pod lead acts on their pod only.
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

async function job(status = "PAYMENT_HELD"): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout,
                         platform_commission, category, tier, pod_id, pod_lead_id, job_code, sla_due_at)
     VALUES ($1,$2,'RING',$3,'USD',5500,0,0,5500,'C',(SELECT tier FROM job_categories WHERE letter='C'),$4,$5,
             'RN-C-' || floor(random()*10000)::int, now() + interval '6 hours')`,
    [id, client, status, pod, podLead],
  );
  return id;
}
const status = async (id: string) => (await db.query("SELECT status, designer_id FROM orders WHERE id=$1", [id])).rows[0];

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

describe("reassign_job", () => {
  it("moves an assigned job freely, and a started one only with a reason", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    await q(podLead, "SELECT public.reassign_job($1,$2)", [id, ravi]);
    expect(await status(id)).toEqual({ status: "ASSIGNED", designer_id: ravi });

    await db.query("UPDATE orders SET status='IN_PROGRESS' WHERE id=$1", [id]);
    await q(ravi, "SELECT public.pause_job($1)", [id]);
    await expect(q(podLead, "SELECT public.reassign_job($1,$2)", [id, dana])).rejects.toThrow(/say why/);
    await q(podLead, "SELECT public.reassign_job($1,$2,'Ravi is on leave tomorrow')", [id, dana]);
    expect(await status(id)).toEqual({ status: "ASSIGNED", designer_id: dana });
    // Ravi's open pause closed with the move; one open assignment, Dana's.
    expect((await db.query("SELECT count(*)::int AS n FROM job_pauses WHERE order_id=$1 AND resumed_at IS NULL", [id])).rows[0].n).toBe(0);
    expect((await db.query("SELECT designer_id FROM job_assignments WHERE order_id=$1 AND ended_at IS NULL", [id])).rows).toEqual([{ designer_id: dana }]);
    const log = await db.query("SELECT payload FROM audit.audit_log WHERE entity_id=$1 AND action='JOB_REASSIGNED' ORDER BY seq", [id]);
    expect(log.rows.at(-1)!.payload).toMatchObject({ from_status: "IN_PROGRESS", reason: "Ravi is on leave tomorrow" });
    const told = await db.query("SELECT user_id FROM notifications WHERE order_id=$1 AND summary LIKE 'A job was moved%'", [id]);
    expect(told.rows.map((r) => r.user_id)).toContain(ravi);
  });

  it("keeps a job waiting on changes waiting, now on the new designer", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    await db.query("UPDATE orders SET status='REVISION_REQUESTED' WHERE id=$1", [id]);
    await q(podLead, "SELECT public.reassign_job($1,$2,'Dana is overloaded')", [id, ravi]);
    expect(await status(id)).toEqual({ status: "REVISION_REQUESTED", designer_id: ravi });
  });

  it("refuses: another pod's lead or designer, the same designer, a job already with QC", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    await expect(q(otherLead, "SELECT public.reassign_job($1,$2)", [id, ravi])).rejects.toThrow(/pod lead may move/);
    await expect(q(dana, "SELECT public.reassign_job($1,$2)", [id, ravi])).rejects.toThrow(/pod lead may move/);
    await expect(q(podLead, "SELECT public.reassign_job($1,$2)", [id, outsider])).rejects.toThrow(/not in this order's pod/);
    await expect(q(podLead, "SELECT public.reassign_job($1,$2)", [id, dana])).rejects.toThrow(/different designer/);
    await db.query("UPDATE orders SET status='QC_REVIEW' WHERE id=$1", [id]);
    await expect(q(podLead, "SELECT public.reassign_job($1,$2,'x')", [id, ravi])).rejects.toThrow(/only a job that is assigned/);
    // An admin may move any pod's work.
    await db.query("UPDATE orders SET status='ASSIGNED' WHERE id=$1", [id]);
    await q(admin, "SELECT public.reassign_job($1,$2)", [id, ravi]);
  });
});

describe("escalations", () => {
  it("the pod lead escalates once; admins are told; an admin resolves and the lead is told", async () => {
    const id = await job("ASSIGNED");
    const eid = (await q(podLead, "SELECT public.escalate_job($1,'Client keeps changing the brief') AS id", [id])).rows[0].id;
    await expect(q(podLead, "SELECT public.escalate_job($1,'again')", [id])).rejects.toThrow(/already escalated/);
    await expect(q(otherLead, "SELECT public.escalate_job($1,'x')", [id])).rejects.toThrow(/pod lead may escalate/);
    expect((await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='ESCALATED' AND order_id=$2", [admin, id])).rows).toHaveLength(1);
    expect((await q(podLead, "SELECT id FROM public.job_escalations_list()")).rows.map((r) => r.id)).toContain(eid);
    expect((await q(otherLead, "SELECT id FROM public.job_escalations_list()")).rows).toHaveLength(0);

    await expect(q(podLead, "SELECT public.resolve_escalation($1,'done')", [eid])).rejects.toThrow(/only an admin/);
    await q(admin, "SELECT public.resolve_escalation($1,'Spoke to the client; brief frozen')", [eid]);
    expect((await q(podLead, "SELECT id FROM public.job_escalations_list()")).rows.map((r) => r.id)).not.toContain(eid);
    expect((await q(podLead, "SELECT resolution FROM public.job_escalations_list(true) WHERE id=$1", [eid])).rows[0].resolution).toBe(
      "Spoke to the client; brief frozen",
    );
    expect((await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='ESCALATED' AND order_id=$2", [podLead, id])).rows).toHaveLength(1);
    await expect(q(podLead, "SELECT * FROM job_escalations")).rejects.toThrow(/permission denied/);
  });
});

describe("pod_activity", () => {
  it("attributes each status change to the designer holding the job at that moment, pauses included", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    await db.query("UPDATE orders SET status='IN_PROGRESS' WHERE id=$1", [id]);
    await db.query("SELECT audit.log_event('ORDER_STATUS_CHANGED','order',$1,NULL,NULL,jsonb_build_object('from','ASSIGNED','to','IN_PROGRESS'))", [id]);
    await q(dana, "SELECT public.pause_job($1)", [id]);
    await q(dana, "SELECT public.resume_job($1)", [id]);
    await q(podLead, "SELECT public.reassign_job($1,$2,'leave')", [id, ravi]);

    const rows = (await q(podLead, "SELECT * FROM public.pod_activity($1) WHERE order_id=$2", [since, id])).rows;
    expect(rows.map((r) => [r.kind, r.to_status, r.designer_id])).toEqual([
      ["STATUS", "ASSIGNED", dana],
      ["STATUS", "IN_PROGRESS", dana],
      ["PAUSE", null, dana],
      ["RESUME", null, dana],
      ["STATUS", "ASSIGNED", ravi],
    ]);
    expect((await q(otherLead, "SELECT * FROM public.pod_activity($1) WHERE order_id=$2", [since, id])).rows).toHaveLength(0);
    await expect(q(dana, "SELECT * FROM public.pod_activity($1)", [since])).resolves.toMatchObject({ rows: [] });
  });
});

describe("sweep_job_alerts", () => {
  it("reminds once when due within the hour, alerts designer and lead once when overdue", async () => {
    const id = await job();
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, dana]);
    const buffer = (await db.query("SELECT coalesce(app.setting('qc_buffer_minutes'), 60) AS m")).rows[0].m;
    await db.query("UPDATE orders SET sla_due_at = now() + make_interval(mins => $2::int + 30) WHERE id=$1", [id, buffer]);
    await db.query("SELECT public.sweep_job_alerts()");
    await db.query("SELECT public.sweep_job_alerts()");
    const soon = await db.query("SELECT user_id FROM notifications WHERE order_id=$1 AND kind='DUE_SOON'", [id]);
    expect(soon.rows.map((r) => r.user_id)).toEqual([dana]);

    await db.query("UPDATE orders SET sla_due_at = now() + make_interval(mins => $2::int - 5) WHERE id=$1", [id, buffer]);
    await db.query("SELECT public.sweep_job_alerts()");
    await db.query("SELECT public.sweep_job_alerts()");
    const late = await db.query("SELECT user_id FROM notifications WHERE order_id=$1 AND kind='OVERDUE' ORDER BY user_id", [id]);
    expect(late.rows.map((r) => r.user_id).sort()).toEqual([dana, podLead].sort());
    await expect(q(podLead, "SELECT public.sweep_job_alerts()")).rejects.toThrow(/permission denied/);
  });
});
