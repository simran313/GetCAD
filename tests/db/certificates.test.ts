import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { completeDesignerWork, completeQcTicks, connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 7a (0050): QC measurements, model volume, waivers, fingerprints and
 * the stored certificate — and who may read each.
 */

let db: Client;
const admin = generateId();
const client = generateId();
const other = generateId();
const designer = generateId();
const podLead = generateId();

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
const asService = async (sql: string, params: unknown[] = []) => {
  await db.query("SET ROLE service_role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("RESET ROLE");
  }
};
const SHA = "a".repeat(64);

let id: string;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'CLIENT','ACTIVE'),
       ($4,'DESIGNER','ACTIVE'), ($5,'QC','ACTIVE')`,
    [admin, client, other, designer, podLead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    "INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at) VALUES ($1,$2,'Rohan','r@x.example',now())",
    [generateId(), designer],
  );

  id = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
  await q(client, `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Halo', p_product => 'RING', p_metal => 'WHITE', p_ring_size => 'US 6.5')`, [id]);
  await putOrderInPod(db, id, podLead);
  await db.query("UPDATE orders SET status='IN_PROGRESS', category='D', designer_id=$2, order_ref='TCP-T1' WHERE id=$1", [id, designer]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("volume and measurements", () => {
  it("the designer enters the volume while working; the pod lead measures in QC", async () => {
    await expect(q(other, "SELECT public.set_job_volume($1, 100)", [id])).rejects.toThrow(/order not found/i);
    await q(designer, "SELECT public.set_job_volume($1, 312.4567)", [id]);
    const spec = (await q(designer, "SELECT public.version_spec($1) AS s", [id])).rows[0].s;
    expect(spec.volume_mm3).toBe(312.457);
    expect(spec.measurements).toBeNull();

    await expect(
      q(podLead, "SELECT public.record_qc_measurements($1, 800, 800, '[]', NULL, NULL, 5, 0)", [id]),
    ).rejects.toThrow(/during QC review/i);
    await completeDesignerWork(db, id, designer);
    await q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id]);
    await expect(
      q(designer, "SELECT public.record_qc_measurements($1, 800, 800, '[]', NULL, NULL, 5, 0)", [id]),
    ).rejects.toThrow(/pod lead/i);
    await q(
      podLead,
      `SELECT public.record_qc_measurements($1, 820, 790, '[{"position":"centre","shape":"Oval","size_mm":"9 x 7"}]', 'US 6.5', 16900, 5, 0)`,
      [id],
    );
    const forLead = (await q(podLead, "SELECT public.version_spec($1) AS s", [id])).rows[0].s;
    expect(forLead.measurements).toMatchObject({ min_wall_um: 820, min_prong_um: 790, ring_size: "US 6.5" });
    expect(forLead.minimums).toEqual({ wall_um: 800, prong_um: 800 });
  });

  it("the team records a waiver; nobody else can", async () => {
    await expect(q(client, "SELECT public.add_spec_waiver($1,'prong','0.6 mm','asked by client')", [id])).rejects.toThrow(/team/i);
    await q(podLead, "SELECT public.add_spec_waiver($1,'prong','0.6 mm','asked by client')", [id]);
    const w = (await q(podLead, "SELECT public.version_spec($1) AS s", [id])).rows[0].s.waivers;
    expect(w).toEqual([{ spec: "prong", requested: "0.6 mm", note: "asked by client" }]);
  });
});

describe("fingerprints and the certificate", () => {
  it("only the server records a fingerprint, once, and delivery archives it", async () => {
    const fv = (await db.query("SELECT file_version_id FROM deliverables WHERE order_id=$1 AND slot='STL'", [id])).rows[0].file_version_id;
    await expect(q(designer, "SELECT public.record_file_fingerprint($1,$2,10)", [fv, SHA])).rejects.toThrow(/permission denied/i);
    await asService("SELECT public.record_file_fingerprint($1,$2,10)", [fv, SHA]);
    await asService("SELECT public.record_file_fingerprint($1,$2,10)", [fv, SHA]);
    await expect(asService("SELECT public.record_file_fingerprint($1,$2,10)", [fv, "b".repeat(64)])).rejects.toThrow(/different fingerprint/i);
  });

  it("the client reads it only after QC passes; the designer never", async () => {
    await expect(q(client, "SELECT public.certificate_data($1)", [id])).rejects.toThrow(/order not found/i);
    await completeQcTicks(db, id, podLead);
    await q(podLead, "SELECT public.record_qc_decision($1,'PASS')", [id]);

    const data = (await q(client, "SELECT public.certificate_data($1) AS d", [id])).rows[0].d;
    expect(data).toMatchObject({ order_ref: "TCP-T1", version: 1, category: "D", issued: false });
    expect(data.checklist).toHaveLength(19);
    expect(data.checklist.every((c: { designer_at: string | null; qc_at: string | null }) => c.designer_at && c.qc_at)).toBe(true);
    expect(data.files).toEqual([{ slot: "STL", sha256: SHA, size_bytes: 10, file_name: expect.any(String) }]);
    expect(data.waivers).toHaveLength(1);
    expect(data.designer_ref).toMatch(/\S/);
    expect(JSON.stringify(data)).not.toMatch(/Rohan/);
    await expect(q(designer, "SELECT public.certificate_data($1)", [id])).rejects.toThrow(/order not found/i);
    await expect(q(other, "SELECT public.certificate_data($1)", [id])).rejects.toThrow(/order not found/i);
  });

  it("a stored certificate never changes", async () => {
    await expect(q(podLead, "SELECT public.record_certificate($1,1,'k',$2,100)", [id, SHA])).rejects.toThrow(/permission denied/i);
    await asService("SELECT public.record_certificate($1,1,$2,$3,100)", [id, `${id}/certificates/v1.pdf`, SHA]);
    const dl = (await q(client, "SELECT * FROM public.certificate_for_download($1)", [id])).rows[0];
    expect(dl).toEqual({ object_key: `${id}/certificates/v1.pdf`, version: 1, sha256: SHA });
    await expect(db.query("UPDATE certificates SET sha256=$2 WHERE order_id=$1", [id, "c".repeat(64)])).rejects.toThrow(/cannot be changed/i);
    await expect(db.query("DELETE FROM certificates WHERE order_id=$1", [id])).rejects.toThrow(/cannot be changed/i);
    expect((await q(designer, "SELECT * FROM public.certificate_for_download($1)", [id])).rows).toHaveLength(0);
  });

  it("delivery archives the version's files", async () => {
    await db.query("UPDATE orders SET status='DELIVERED' WHERE id=$1", [id]);
    const f = (await db.query("SELECT archived_at FROM deliverable_files WHERE order_id=$1", [id])).rows[0];
    expect(f.archived_at).not.toBeNull();
    const fp = (await q(client, "SELECT slot, sha256 FROM public.order_fingerprints($1)", [id])).rows;
    expect(fp).toEqual([{ slot: "STL", sha256: SHA }]);
  });
});

describe("weight sheet data", () => {
  it("gives the volume, the densities and the brief — never the client's label", async () => {
    const w = (await q(client, "SELECT public.weight_sheet_data($1) AS w", [id])).rows[0].w;
    expect(w.volume_mm3).toBe(312.457);
    expect(w.densities_mg_cm3).toEqual({ "10K": 11600, "14K": 13100, "18K": 15600, Pt950: 21400, Ag925: 10400 });
    expect(w.spec.ring_size).toBe("US 6.5");
    expect(w.spec.reference_name).toBeUndefined();
    const forDesigner = (await q(designer, "SELECT public.weight_sheet_data($1) AS w", [id])).rows[0].w;
    expect(forDesigner.ref).not.toBe("TCP-T1");
  });
});
