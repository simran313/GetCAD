import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 13b (0057): pause and resume with every interval recorded, the
 * recorded job times (active = started → submitted or now, minus pauses),
 * and the pod's shared materials (the lead shares, the pod reads).
 */
let db: Client;
const client = generateId();
const designer = generateId();
const otherDesigner = generateId(); // in another pod
const podLead = generateId();
const otherLead = generateId();
let order: string;
let pod: string;
let otherPod: string;

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
const times = async (who: string, id = order) => (await q(who, "SELECT * FROM public.job_times($1)", [id])).rows[0];

/** A status change recorded in the audit log at a chosen moment. */
const moved = (id: string, to: string, at: string) =>
  db.query(
    `INSERT INTO audit.audit_log (action, entity_type, entity_id, payload, created_at)
     VALUES ('ORDER_STATUS_CHANGED','order',$1,jsonb_build_object('to',$2::text),$3)`,
    [id, to, at],
  );

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE'), ($2,'DESIGNER','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'QC','ACTIVE'), ($5,'QC','ACTIVE')`,
    [client, designer, otherDesigner, podLead, otherLead],
  );
  order = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [order]);
  pod = await putOrderInPod(db, order, podLead);
  await db.query("INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'DESIGNER')", [pod, designer]);
  const stray = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [stray]);
  otherPod = await putOrderInPod(db, stray, otherLead);
  await db.query("INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'DESIGNER')", [otherPod, otherDesigner]);
  await db.query("UPDATE orders SET designer_id=$2, status='ASSIGNED' WHERE id=$1", [order, designer]);
});

afterAll(async () => {
  await db?.end();
});

describe("pause and resume", () => {
  it("only a job in progress, only its designer, one open pause at a time", async () => {
    await expect(q(designer, "SELECT public.pause_job($1)", [order])).rejects.toThrow(/only a job in progress/);
    await db.query("UPDATE orders SET status='IN_PROGRESS' WHERE id=$1", [order]);
    await moved(order, "IN_PROGRESS", new Date(Date.now() - 3 * 3600_000).toISOString());
    await expect(q(otherDesigner, "SELECT public.pause_job($1)", [order])).rejects.toThrow(/assigned designer/);
    await expect(q(podLead, "SELECT public.pause_job($1)", [order])).rejects.toThrow(/assigned designer/);
    await q(designer, "SELECT public.pause_job($1)", [order]);
    await expect(q(designer, "SELECT public.pause_job($1)", [order])).rejects.toThrow(/already paused/);
    expect((await times(designer)).paused_at).not.toBeNull();
    await q(designer, "SELECT public.resume_job($1)", [order]);
    await expect(q(designer, "SELECT public.resume_job($1)", [order])).rejects.toThrow(/not paused/);
    const log = await db.query("SELECT action FROM audit.audit_log WHERE entity_id=$1 AND action LIKE 'JOB_%' ORDER BY seq", [order]);
    expect(log.rows.map((r) => r.action)).toEqual(["JOB_PAUSED", "JOB_RESUMED"]);
  });

  it("active time is started → now minus recorded pauses", async () => {
    // One finished pause of 30 minutes inside the three hours.
    await db.query("DELETE FROM job_pauses WHERE order_id=$1", [order]);
    await db.query(
      "INSERT INTO job_pauses (order_id, version, designer_id, paused_at, resumed_at) VALUES ($1,1,$2, now() - interval '2 hours', now() - interval '90 minutes')",
      [order, designer],
    );
    const t = await times(designer);
    expect(t.paused_seconds).toBe(1800);
    expect(Math.abs(t.active_seconds - (3 * 3600 - 1800))).toBeLessThan(5);
  });

  it("submitting closes an open pause and freezes active time at submission", async () => {
    await q(designer, "SELECT public.pause_job($1)", [order]);
    await db.query("UPDATE orders SET status='QC_REVIEW' WHERE id=$1", [order]);
    const open = await db.query("SELECT count(*)::int AS n FROM job_pauses WHERE order_id=$1 AND resumed_at IS NULL", [order]);
    expect(open.rows[0].n).toBe(0);
    await moved(order, "QC_REVIEW", new Date(Date.now() - 3600_000).toISOString());
    const t = await times(designer);
    expect(t.submitted_at).not.toBeNull();
    expect(t.paused_at).toBeNull();
    // Started 3 h ago, submitted 1 h ago, 30 min paused (+ the seconds-long pause).
    expect(Math.abs(t.active_seconds - (2 * 3600 - 1800))).toBeLessThan(10);
  });

  it("the pod's lead reads the times; another pod's lead, another designer and the client do not", async () => {
    expect((await times(podLead)).order_id).toBe(order);
    expect(await times(otherLead)).toBeUndefined();
    expect(await times(otherDesigner)).toBeUndefined();
    expect(await times(client)).toBeUndefined();
  });

  it("pauses are not readable directly", async () => {
    await expect(q(designer, "SELECT * FROM job_pauses")).rejects.toThrow(/permission denied/);
  });
});

describe("pod materials", () => {
  const add = (who: string, podId: string, key: string, title = "Prong chart") =>
    q(who, "SELECT public.add_pod_material($1,$2,$3,$4,$5,'chart.pdf','application/pdf',1200)", [
      generateId(),
      podId,
      title,
      "Minimum prong sizes by stone",
      key,
    ]);

  it("the lead shares with their own pod only, under that pod's folder", async () => {
    await add(podLead, pod, `materials/${pod}/a.pdf`);
    await expect(add(podLead, otherPod, `materials/${otherPod}/b.pdf`)).rejects.toThrow(/pod's lead or an admin/);
    await expect(add(podLead, pod, `${order}/elsewhere.pdf`)).rejects.toThrow(/file not found/);
    await expect(add(designer, pod, `materials/${pod}/c.pdf`)).rejects.toThrow(/pod's lead or an admin/);
    expect((await q(podLead, "SELECT id FROM public.material_pods()")).rows.map((r) => r.id)).toEqual([pod]);
  });

  it("the pod's designers read it and its file; other pods do not", async () => {
    const mine = (await q(designer, "SELECT * FROM public.pod_materials()")).rows;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Prong chart", description: "Minimum prong sizes by stone", can_manage: false });
    expect((await q(otherDesigner, "SELECT * FROM public.pod_materials()")).rows).toHaveLength(0);
    const file = (await q(designer, "SELECT public.pod_material_file($1) AS f", [mine[0].id])).rows[0].f;
    expect(file.object_key).toBe(`materials/${pod}/a.pdf`);
    expect((await q(otherDesigner, "SELECT public.pod_material_file($1) AS f", [mine[0].id])).rows[0].f).toBeNull();
  });

  it("only the lead removes it; then it is gone for everyone", async () => {
    const [m] = (await q(podLead, "SELECT * FROM public.pod_materials()")).rows;
    expect(m.can_manage).toBe(true);
    await expect(q(designer, "SELECT public.remove_pod_material($1)", [m.id])).rejects.toThrow(/material not found/);
    await q(podLead, "SELECT public.remove_pod_material($1)", [m.id]);
    expect((await q(designer, "SELECT * FROM public.pod_materials()")).rows).toHaveLength(0);
    expect((await q(designer, "SELECT public.pod_material_file($1) AS f", [m.id])).rows[0].f).toBeNull();
    await expect(q(designer, "SELECT * FROM pod_materials")).rejects.toThrow(/permission denied/);
  });
});
