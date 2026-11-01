import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * The summary sheet's data (Phase 13a, 0056): the client from approval on,
 * the order's team always, never the designer (it carries the client's
 * order reference). The render and technical images of THIS version, and
 * the timeline from the audit log.
 */
let db: Client;
const client = generateId();
const designer = generateId();
const podLead = generateId();
const stranger = generateId();
let id: string;

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
const summary = async (who: string) => (await q(who, "SELECT public.summary_sheet_data($1) AS d", [id])).rows[0].d;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE'), ($2,'DESIGNER','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'CLIENT','ACTIVE')`,
    [client, designer, podLead, stranger],
  );
  id = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
  await putOrderInPod(db, id, podLead);
  await db.query("UPDATE orders SET designer_id=$2, status='IN_PROGRESS', sla_started_at='2026-11-01T10:00:00Z' WHERE id=$1", [id, designer]);
  for (const slot of ["RENDER", "TECH", "3DM"]) {
    await q(designer, "SELECT public.add_slot_file($1,$2,$3,$4,'image/png',10,'png')", [generateId(), id, slot, `${id}/${slot}.png`]);
  }
  await q(designer, "SELECT public.set_job_volume($1, 312.5)", [id]);
  // The audit log is append-only, so these are stamped now; only their presence is checked.
  for (const to of ["CLIENT_PREVIEW", "APPROVED"]) {
    await db.query("SELECT audit.log_event('ORDER_STATUS_CHANGED','order',$1,NULL,NULL,jsonb_build_object('to',$2::text))", [id, to]);
  }
});

afterAll(async () => {
  await db?.end();
});

describe("summary_sheet_data (0056)", () => {
  it("the team reads it at any stage, with this version's two images, volume and timeline", async () => {
    const d = await summary(podLead);
    expect(Object.keys(d.images).sort()).toEqual(["RENDER", "TECH"]);
    expect(d.images.RENDER.key).toBe(`${id}/RENDER.png`);
    expect(Number(d.volume_mm3)).toBe(312.5);
    expect(d.timeline.map((t: { to: string }) => t.to)).toEqual(expect.arrayContaining(["CLIENT_PREVIEW", "APPROVED"]));
    expect(d.ref).toBeTruthy();
  });

  it("the client only once approved; the designer and strangers never", async () => {
    await expect(summary(client)).rejects.toThrow(/order not found/);
    await expect(summary(designer)).rejects.toThrow(/order not found/);
    await expect(summary(stranger)).rejects.toThrow(/order not found/);
    await db.query("UPDATE orders SET status='APPROVED' WHERE id=$1", [id]);
    expect((await summary(client)).ref).toBeTruthy();
    await expect(summary(designer)).rejects.toThrow(/order not found/);
  });
});
