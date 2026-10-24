import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * 0035: categories, price bands, feature flags, settings, client codes and
 * the order reference (owner answer Q3: MJ1-RN-C-1).
 */

let db: Client;

const admin = generateId();
const ops = generateId();
const designer = generateId();
const clientMeera = generateId();
const clientMaya = generateId();
const clientSolo = generateId();
const clientNoProfile = generateId();

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

async function submitted(clientId: string, product: string | null, service = "cad"): Promise<{ order_ref: string; job_code: string }> {
  const id = generateId();
  await q(clientId, "SELECT public.create_order($1,'free text','USD')", [id]);
  await db.query("UPDATE orders SET service=$2 WHERE id=$1", [id, service]);
  if (product) {
    await q(clientId, "SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'x', p_product => $2::product_kind, p_metal => 'YELLOW')", [id, product]);
  }
  await q(clientId, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
  const { rows } = await db.query("SELECT order_ref, job_code FROM orders WHERE id=$1", [id]);
  return rows[0];
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'DESIGNER','ACTIVE'),
       ($4,'CLIENT','ACTIVE'), ($5,'CLIENT','ACTIVE'), ($6,'CLIENT','ACTIVE'), ($7,'CLIENT','ACTIVE')`,
    [admin, ops, designer, clientMeera, clientMaya, clientSolo, clientNoProfile],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("categories and price bands (DECISIONS §3, §4)", () => {
  it("seeds A–L exactly, with designer pay = minutes × ₹500 / 60", async () => {
    const { rows } = await db.query("SELECT letter, minutes, tier, designer_rate_paise FROM job_categories ORDER BY letter");
    expect(rows.map((r) => [r.letter, r.minutes, r.tier, r.designer_rate_paise])).toEqual([
      ["A", 15, "standard", 12500], ["B", 30, "standard", 25000], ["C", 45, "standard", 37500],
      ["D", 60, "standard", 50000], ["E", 90, "standard", 75000], ["F", 120, "standard", 100000],
      ["G", 180, "complex", 150000], ["H", 240, "complex", 200000], ["I", 300, "complex", 250000],
      ["J", 360, "complex", 300000], ["K", 420, "complex", 350000], ["L", 480, "complex", 400000],
    ]);
  });

  it("seeds the price bands: $55 A–C, $85 D–F, from $120 G–L, $49 first design", async () => {
    const { rows } = await db.query(
      "SELECT code, first_category, last_category, price_cents, is_from, first_order_only FROM price_bands ORDER BY price_cents",
    );
    expect(rows).toEqual([
      { code: "BAND_FIRST", first_category: "A", last_category: "C", price_cents: 4900, is_from: false, first_order_only: true },
      { code: "BAND_STANDARD", first_category: "A", last_category: "C", price_cents: 5500, is_from: false, first_order_only: false },
      { code: "BAND_COMPLEX", first_category: "D", last_category: "F", price_cents: 8500, is_from: false, first_order_only: false },
      { code: "BAND_SCULPTED", first_category: "G", last_category: "L", price_cents: 12000, is_from: true, first_order_only: false },
    ]);
  });

  it("only an admin changes a category rate; staff and designers read rates; clients do not", async () => {
    await expect(q(ops, "SELECT public.set_category_rate('D', 60000)")).rejects.toThrow(/only an admin/i);
    await q(admin, "SELECT public.set_category_rate('D', 60000)");
    expect((await db.query("SELECT designer_rate_paise FROM job_categories WHERE letter='D'")).rows[0].designer_rate_paise).toBe(60000);
    await q(admin, "SELECT public.set_category_rate('D', 50000)");

    expect((await q(ops, "SELECT letter FROM job_categories")).rows).toHaveLength(12);
    expect((await q(clientMeera, "SELECT letter FROM job_categories")).rows).toHaveLength(0);
    // Phase 5c (policies/0036): the designer's own rate card (docs/design D6).
    expect((await q(designer, "SELECT letter FROM job_categories")).rows).toHaveLength(12);
    expect((await q(clientMeera, "SELECT code FROM price_bands")).rows).toHaveLength(4);
  });
});

describe("feature flags and settings (DECISIONS §12)", () => {
  it("defaults match the October launch", async () => {
    const { rows } = await db.query("SELECT key, enabled FROM feature_flags ORDER BY key");
    expect(Object.fromEntries(rows.map((r) => [r.key, r.enabled]))).toEqual({
      auto_sla_credit: false,
      capacity_blocking: false,
      dental: false,
      in_app_payouts: false,
      public_stats: false,
      render_brief_one_page: true,
      rush: false,
      wallet_checkout: false,
    });
  });

  it("only an admin flips a flag, and the change is audited", async () => {
    await expect(q(ops, "SELECT public.set_feature_flag('rush', true)")).rejects.toThrow(/only an admin/i);
    await q(admin, "SELECT public.set_feature_flag('rush', true)");
    expect((await q(clientMeera, "SELECT app.flag('rush') AS f")).rows[0].f).toBe(true);
    await q(admin, "SELECT public.set_feature_flag('rush', false)");
    const audit = await db.query("SELECT count(*)::int AS n FROM audit.audit_log WHERE action='FEATURE_FLAG_SET'");
    expect(audit.rows[0].n).toBe(2);
    await expect(q(admin, "SELECT public.set_feature_flag('nope', true)")).rejects.toThrow(/unknown flag/i);
  });

  it("settings: admin-only writes, staff-only reads; FX default ₹84", async () => {
    expect((await db.query("SELECT value FROM app_settings WHERE key='usd_inr_paise_per_usd'")).rows[0].value).toBe(8400);
    await expect(q(ops, "SELECT public.set_app_setting('shift_minutes', 500)")).rejects.toThrow(/only an admin/i);
    await q(admin, "SELECT public.set_app_setting('shift_minutes', 480)");
    expect((await q(ops, "SELECT key FROM app_settings")).rows.length).toBeGreaterThan(10);
    expect((await q(clientMeera, "SELECT key FROM app_settings")).rows).toHaveLength(0);
    expect((await q(designer, "SELECT key FROM app_settings")).rows).toHaveLength(0);
  });
});

describe("client codes and order references (owner answer Q3)", () => {
  it("derives the code from business-name initials, counting per initials", async () => {
    const meera = await q(clientMeera, "SELECT public.save_client_profile('Meera Jewels','Meera S','m@x.example') AS r");
    expect(meera.rows[0].r.client_code).toBe("MJ1");
    const maya = await q(clientMaya, "SELECT public.save_client_profile('Maya Jewelry Co','Maya K','k@x.example') AS r");
    expect(maya.rows[0].r.client_code).toBe("MJ2");
    const solo = await q(clientSolo, "SELECT public.save_client_profile('Tiffanyesque','T T','t@x.example') AS r");
    expect(solo.rows[0].r.client_code).toBe("TI1");
  });

  it("the code does not change when the profile is saved again", async () => {
    const again = await q(clientMeera, "SELECT public.save_client_profile('Other Name','Meera S','m@x.example') AS r");
    expect(again.rows[0].r.client_code).toBe("MJ1");
  });

  it("mints {CLIENT}-{PRODUCT}-{SERVICE}-{N} at first submit, N running from 1 with no padding", async () => {
    const a = await submitted(clientMeera, "RING");
    expect(a.order_ref).toBe("MJ1-RN-C-1");
    expect(a.job_code).toBe("RN-C-1");
    const b = await submitted(clientMaya, "PENDANT", "render");
    expect(b.order_ref).toBe("MJ2-PD-R-2");
    const c = await submitted(clientMeera, "BANGLE", "cad_render");
    expect(c.order_ref).toBe("MJ1-BG-CR-3");
  });

  it("maps every product code; brooch and unknown products are OT", async () => {
    const { rows } = await db.query(
      "SELECT p, app.product_code(p) AS c FROM unnest(ARRAY['RING','SIGNET','BAND','PENDANT','EARRING','BRACELET','BANGLE','NECKLACE','BROOCH','OTHER']) p",
    );
    expect(rows.map((r) => r.c)).toEqual(["RN", "RN", "BD", "PD", "ER", "BR", "BG", "NK", "OT", "OT"]);
  });

  it("a client with no profile gets a CL code; a DRAFT burns no number", async () => {
    const draft = generateId();
    await q(clientNoProfile, "SELECT public.create_order($1,'x','USD')", [draft]);
    expect((await db.query("SELECT order_ref FROM orders WHERE id=$1", [draft])).rows[0].order_ref).toBeNull();
    const d = await submitted(clientNoProfile, null);
    expect(d.order_ref).toBe("CL1-OT-C-4");
  });

  it("a client reads their own code; a designer never reads any", async () => {
    expect((await q(clientMeera, "SELECT client_code FROM client_accounts")).rows).toEqual([{ client_code: "MJ1" }]);
    expect((await q(designer, "SELECT client_code FROM client_accounts")).rows).toHaveLength(0);
    expect((await q(admin, "SELECT client_code FROM client_accounts")).rows.length).toBe(4);
  });

  it("a designer sees the job code, never the client reference", async () => {
    const id = generateId();
    await q(clientMeera, "SELECT public.create_order($1,'x','USD')", [id]);
    await q(clientMeera, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
    await db.query("UPDATE orders SET designer_id=$2, status='IN_PROGRESS' WHERE id=$1", [id, designer]);
    const { rows } = await q(designer, "SELECT display_ref, price_total, currency FROM public.visible_orders()");
    expect(rows).toHaveLength(1);
    expect(rows[0].display_ref).toMatch(/^OT-C-\d+$/);
    expect(rows[0].price_total).toBeNull();
    expect(rows[0].currency).toBeNull();
  });
});

describe("the brief (owner answer Q6, DECISIONS §11–12)", () => {
  let id: string;

  beforeAll(async () => {
    id = generateId();
    await q(clientMeera, "SELECT public.create_order($1,'x','USD')", [id]);
  });

  it("only product and metal are required to save; karat, purpose, format, finish are optional", async () => {
    await q(clientMeera, "SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'r', p_product => 'RING', p_metal => 'WHITE')", [id]);
    const { rows } = await db.query("SELECT karatage, purpose, format, finish FROM order_specs WHERE order_id=$1", [id]);
    expect(rows[0]).toEqual({ karatage: null, purpose: null, format: null, finish: null });
  });

  it("brief_missing lists what DECISIONS §11 still needs: a reference and a size", async () => {
    const before = await q(clientMeera, "SELECT public.brief_missing($1) AS m", [id]);
    expect(before.rows[0].m).toEqual(["reference", "size"]);
    await q(clientMeera, "SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'r', p_product => 'RING', p_metal => 'WHITE', p_ring_size => 'US 7')", [id]);
    await q(clientMeera, "SELECT public.add_reference_image($1,$2,'image/png',10)", [id, `refs/${generateId()}.png`]);
    const after = await q(clientMeera, "SELECT public.brief_missing($1) AS m", [id]);
    expect(after.rows[0].m).toEqual([]);
    await expect(q(clientMaya, "SELECT public.brief_missing($1)", [id])).rejects.toThrow(/order not found/i);
  });

  it("refuses rush or express while the rush flag is off", async () => {
    await expect(
      q(clientMeera, "SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'r', p_product => 'RING', p_metal => 'WHITE', p_priority => 'RUSH')", [id]),
    ).rejects.toThrow(/rush delivery is not available/i);
    await expect(
      q(clientMeera, "SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'r', p_product => 'RING', p_metal => 'WHITE', p_priority => 'EXPRESS')", [id]),
    ).rejects.toThrow(/rush delivery is not available/i);
  });
});
