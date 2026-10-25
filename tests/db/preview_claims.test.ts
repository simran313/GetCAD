import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 7b (0051): preview links, spec claims, public stats.
 */

let db: Client;
const admin = generateId();
const client = generateId();
const other = generateId();
const designer = generateId();
const podLead = generateId();
const TOKEN = "t".repeat(20) + generateId() + generateId();
const SHA = "e".repeat(64);

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

let id: string;

async function deliveredOrder(): Promise<string> {
  const oid = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [oid]);
  await q(client, `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Halo', p_product => 'RING', p_metal => 'WHITE')`, [oid]);
  await putOrderInPod(db, oid, podLead);
  await db.query(
    `UPDATE orders SET status='APPROVED', category='D', tier='standard', designer_id=$2, price_total=8500, currency='USD',
            qc_payout_paise=140000, designer_payout_paise=50000 WHERE id=$1`,
    [oid, designer],
  );
  await db.query(
    "INSERT INTO escrow_ledger (order_id, kind, party, amount, currency, created_by) VALUES ($1,'HOLD','CLIENT',8500,'USD',$2)",
    [oid, client],
  );
  for (const slot of ["STL", "TV"]) {
    const fv = generateId();
    await db.query(
      `INSERT INTO file_versions (id, order_id, version_no, object_key, content_type, size_bytes, uploaded_by, kind)
       VALUES ($1,$2,(SELECT coalesce(max(version_no),0)+1 FROM file_versions WHERE order_id=$2),$3,'model/stl',10,$4,app.slot_kind($5))`,
      [fv, oid, `${oid}/${slot}.bin`, designer, slot],
    );
    await db.query("INSERT INTO deliverables (order_id, slot, version, file_version_id, file_name) VALUES ($1,$2,1,$3,$4)", [oid, slot, fv, `${slot}_v1`]);
    if (slot === "STL") await asService("SELECT public.record_file_fingerprint($1,$2,10)", [fv, SHA]);
  }
  return oid;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'CLIENT','ACTIVE'),
       ($4,'DESIGNER','ACTIVE'), ($5,'QC','ACTIVE')`,
    [admin, client, other, designer, podLead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    "INSERT INTO client_profiles (id, user_id, legal_name, email, business_name) VALUES ($1,$2,'Ann','a@x.example','Maple Row Jewelers')",
    [generateId(), client],
  );
  id = await deliveredOrder();
});

afterAll(async () => {
  if (db) await db.end();
});

describe("preview links (A5)", () => {
  it("the client makes one for an approved design; the public page sees only that order's files and the jeweler", async () => {
    await expect(q(other, "SELECT public.create_preview_link($1,$2)", [id, TOKEN])).rejects.toThrow(/approved the design/i);
    await q(client, "SELECT public.set_client_logo($1)", [`logos/${client}/logo.png`]);
    await expect(q(client, "SELECT public.set_client_logo('logos/someone/x.png')")).rejects.toThrow(/not your logo/i);
    const linkId = (await q(client, "SELECT public.create_preview_link($1,$2,30) AS id", [id, TOKEN])).rows[0].id;

    await expect(q(client, "SELECT public.preview_by_token($1)", [TOKEN])).rejects.toThrow(/permission denied/i);
    const page = (await asService("SELECT public.preview_by_token($1) AS p", [TOKEN])).rows[0].p;
    expect(page).toMatchObject({ jeweler: "Maple Row Jewelers", logo_key: `logos/${client}/logo.png`, product: "RING" });
    expect(page.stl_key).toBe(`${id}/STL.bin`);
    expect(page.renders).toEqual([{ slot: "TV", key: `${id}/TV.bin` }]);
    expect(JSON.stringify(page)).not.toMatch(/8500|TCP-|price/i);
    expect((await asService("SELECT public.preview_by_token($1) AS p", ["x".repeat(40)])).rows[0].p).toBeNull();

    const links = (await q(client, "SELECT view_count, revoked_at FROM public.my_preview_links($1)", [id])).rows;
    expect(links).toEqual([{ view_count: 1, revoked_at: null }]);
    expect(JSON.stringify(links)).not.toContain(TOKEN);

    await db.query("UPDATE preview_links SET expires_at = now() - interval '1 minute' WHERE id=$1", [linkId]);
    expect((await asService("SELECT public.preview_by_token($1) AS p", [TOKEN])).rows[0].p).toBeNull();
    await q(client, "SELECT public.update_preview_link($1, false, 7)", [linkId]);
    expect((await asService("SELECT public.preview_by_token($1) AS p", [TOKEN])).rows[0].p).not.toBeNull();
    await q(client, "SELECT public.update_preview_link($1, true)", [linkId]);
    expect((await asService("SELECT public.preview_by_token($1) AS p", [TOKEN])).rows[0].p).toBeNull();
    await expect(q(client, "SELECT public.update_preview_link($1, false, 7)", [linkId])).rejects.toThrow(/revoked/i);
  });
});

describe("spec claims (A6)", () => {
  const open = (sha: string, spec = "wall", oid = id) =>
    asService("SELECT public.open_spec_claim($1,$2,$3,'Wall cracked at the shank','14K, Formlabs castable, 1.5%',$4,$5,$6) AS r", [
      client,
      oid,
      spec,
      sha,
      `${oid}/claims/file.stl`,
      [`${oid}/claims/p1.jpg`],
    ]);

  it("opens only after delivery, within the window", async () => {
    await expect(open(SHA)).rejects.toThrow(/within 30 days of delivery/i);
    await db.query("UPDATE orders SET status='DELIVERED' WHERE id=$1", [id]);
    await db.query(
      "INSERT INTO audit.audit_log (action, entity_type, entity_id, payload, hash) VALUES ('ORDER_STATUS_CHANGED','order',$1,'{\"to\":\"DELIVERED\"}','x')",
      [id],
    ).catch(() => undefined);
    const w = (await q(client, "SELECT public.claim_window($1) AS w", [id])).rows[0].w;
    expect(w.open).toBe(true);
    await expect(q(client, "SELECT public.open_spec_claim($1,$2,'wall','x','y',$3,'k',ARRAY['k'])", [client, id, SHA])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("a file that doesn't match what we delivered is not covered", async () => {
    const r = (await open("f".repeat(64))).rows[0].r;
    expect(r.status).toBe("not_covered");
    expect(r.reason).toMatch(/changed after delivery/i);
  });

  it("the pod lead re-measures and upholds: a free fix job and the fee back as credit, once", async () => {
    const r = (await open(SHA)).rows[0].r;
    expect(r.status).toBe("open");
    await expect(open(SHA)).rejects.toThrow(/one at a time/i);

    const claims = (await q(client, "SELECT status, file_object_key FROM public.order_claims($1)", [id])).rows;
    expect(claims.map((c) => c.status)).toEqual(["open", "not_covered"]);
    expect(claims[0].file_object_key).toBeNull();
    expect((await q(designer, "SELECT * FROM public.order_claims($1)", [id])).rows).toHaveLength(0);
    expect((await q(podLead, "SELECT id FROM public.claims_queue()")).rows.map((c) => c.id)).toEqual([r.claim_id]);

    await expect(q(client, "SELECT public.decide_spec_claim($1,true,'{}','x',$2)", [r.claim_id, generateId()])).rejects.toThrow(/not yours/i);
    const fix = generateId();
    const d = (await q(podLead, `SELECT public.decide_spec_claim($1,true,'{"min_wall_um":600}','Measured 0.60 mm at the shank',$2) AS d`, [r.claim_id, fix])).rows[0].d;
    expect(d).toMatchObject({ upheld: true, fix_order_id: fix });

    const fo = (await db.query(
      "SELECT status, price_total, designer_payout_paise, qc_payout_paise, category, sla_status, client_id, pod_id FROM orders WHERE id=$1",
      [fix],
    )).rows[0];
    expect(fo).toMatchObject({ status: "PAYMENT_HELD", price_total: 0, designer_payout_paise: 0, qc_payout_paise: 140000, category: "D", sla_status: "running", client_id: client });
    const credit = (await db.query("SELECT kind, amount_cents, status FROM client_credits WHERE order_id=$1", [id])).rows;
    expect(credit).toEqual([{ kind: "claim_credit", amount_cents: 8500, status: "apply_next" }]);

    // An admin overturning a later rejection does not credit twice.
    const r2 = (await open(SHA, "prong")).rows[0].r;
    await q(podLead, "SELECT public.decide_spec_claim($1,false,'{}','Prongs measure 0.85 mm',NULL)", [r2.claim_id]);
    await q(admin, "SELECT public.decide_spec_claim($1,true,'{}','Overturned on review',$2)", [r2.claim_id, generateId()]);
    expect((await db.query("SELECT count(*)::int AS n FROM client_credits WHERE order_id=$1", [id])).rows[0].n).toBe(1);
  });

  it("a waived spec is not covered, and a third claim in 90 days goes to admin", async () => {
    await q(podLead, "SELECT public.add_spec_waiver($1,'mesh','0.01 mm',NULL)", [id]);
    expect((await open(SHA, "mesh")).rows[0].r.status).toBe("not_covered");
    const second = await deliveredOrder();
    await db.query("UPDATE orders SET status='DELIVERED' WHERE id=$1", [second]);
    await db.query(
      "INSERT INTO audit.audit_log (action, entity_type, entity_id, payload, hash) VALUES ('ORDER_STATUS_CHANGED','order',$1,'{\"to\":\"DELIVERED\"}','x')",
      [second],
    ).catch(() => undefined);
    const r = (await open(SHA, "size", second)).rows[0].r;
    expect(r.status).toBe("admin_review");
    await expect(q(podLead, "SELECT public.decide_spec_claim($1,false,'{}','x',NULL)", [r.claim_id])).rejects.toThrow(/not yours/i);
  });
});

describe("public stats (A7)", () => {
  it("are computed weekly and readable only while the flag is on", async () => {
    await expect(q(client, "SELECT public.compute_public_stats()")).rejects.toThrow(/admin/i);
    await q(admin, "SELECT public.compute_public_stats()");
    expect((await q(client, "SELECT * FROM public.public_stats_latest()")).rows).toHaveLength(0);
    expect((await asService("SELECT * FROM public.public_stats_latest()")).rows).toHaveLength(0);
    expect((await q(admin, "SELECT * FROM public.public_stats_latest()")).rows).toHaveLength(1);
    await db.query("UPDATE feature_flags SET enabled=true WHERE key='public_stats'");
    const row = (await q(client, "SELECT * FROM public.public_stats_latest()")).rows[0];
    expect(row.designs_delivered).toBeGreaterThanOrEqual(0);
    // Two claims were upheld above (one on review); each counts once.
    expect(row.claims_upheld).toBe(2);
    expect(row.late_credits_issued).toBe(0);
    await db.query("UPDATE feature_flags SET enabled=false WHERE key='public_stats'");
  });
});
