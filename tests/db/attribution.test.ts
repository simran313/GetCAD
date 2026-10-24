import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * Phase 6 (0049): attribution and the funnel, in our own database.
 */

let db: Client;
const admin = generateId();
const ops = generateId();
const client = generateId();

async function as<T>(sub: string | null, fn: () => Promise<T>): Promise<T> {
  if (sub) {
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
    await db.query("SET ROLE authenticated");
  } else {
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
    await db.query("SET ROLE anon");
  }
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

const q = (sub: string | null, sql: string, params: unknown[] = []) => as(sub, () => db.query(sql, params));
const events = async (order: string) =>
  (await db.query("SELECT event FROM marketing_events WHERE order_id=$1 ORDER BY created_at, event", [order])).rows.map((r) => r.event);

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    "INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'CLIENT','ACTIVE')",
    [admin, ops, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("save_attribution (S3)", () => {
  it("needs an answer, keeps the first one and only the cookie's keys", async () => {
    await expect(q(client, "SELECT public.save_attribution('')")).rejects.toThrow(/how you heard/i);
    await expect(q(client, "SELECT public.save_attribution('tiktok')")).rejects.toThrow(/check/i);
    expect((await q(client, "SELECT public.has_attribution() AS h")).rows[0].h).toBe(false);

    await q(client, "SELECT public.save_attribution('google', $1::jsonb)", [
      JSON.stringify({ utm_source: "google", landing_path: "/jewelry-cad", evil: "x" }),
    ]);
    await q(client, "SELECT public.save_attribution('instagram')");
    const row = (await db.query("SELECT heard_about, first_touch FROM marketing_attribution WHERE user_id=$1", [client])).rows[0];
    expect(row).toEqual({ heard_about: "google", first_touch: { utm_source: "google", landing_path: "/jewelry-cad" } });
    expect((await q(client, "SELECT public.has_attribution() AS h")).rows[0].h).toBe(true);
    await expect(q(client, "SELECT * FROM marketing_attribution")).rejects.toThrow(/permission denied/i);
  });
});

describe("the funnel", () => {
  it("records order events in the database and app events from visitors", async () => {
    const id = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
    await q(client, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
    await db.query("UPDATE orders SET status='QUOTED', price_total=5500 WHERE id=$1", [id]);
    await db.query(
      "INSERT INTO escrow_ledger (order_id, kind, party, amount, currency, created_by) VALUES ($1,'HOLD','CLIENT',5500,'USD',$2)",
      [id, client],
    );
    await db.query("UPDATE orders SET status='APPROVED' WHERE id=$1", [id]);
    expect(await events(id)).toEqual(["brief_submitted", "payment_completed", "approved"]);

    await q(client, "SELECT public.record_marketing_event('first_look_viewed', $1)", [id]);
    await expect(q(client, "SELECT public.record_marketing_event('approved', $1)", [id])).rejects.toThrow(/database, not the app/i);
    await q(null, "SELECT public.record_marketing_event('brief_started', $1, 'v-123', '{\"product\":\"RING\"}')", [id]);
    const anon = (await db.query("SELECT user_id, order_id, visitor_id FROM marketing_events WHERE visitor_id='v-123'")).rows[0];
    expect(anon).toEqual({ user_id: null, order_id: null, visitor_id: "v-123" });

    const report = (await q(admin, "SELECT public.attribution_report() AS r")).rows[0].r;
    expect(report.heard_about).toEqual({ google: 1 });
    expect(report.sources).toEqual({ google: 1 });
    expect(report.events_30d).toMatchObject({ brief_started: 1, approved: 1, payment_completed: 1 });
    await expect(q(ops, "SELECT public.attribution_report()")).rejects.toThrow(/admin/i);
  });
});

describe("start_brief_lead (/jewelry-cad)", () => {
  it("makes a lead for the team from a visitor's email and piece", async () => {
    const id = (await q(null, "SELECT public.start_brief_lead('owner@harbor.example','Ring','halo') AS id")).rows[0].id;
    const lead = (await db.query("SELECT email, role, message, status FROM marketing_leads WHERE id=$1", [id])).rows[0];
    expect(lead).toEqual({
      email: "owner@harbor.example",
      role: "BUSINESS",
      message: "Started a brief on /jewelry-cad: Ring — halo",
      status: "NEW",
    });
    await expect(q(null, "SELECT public.start_brief_lead('nope','Ring')")).rejects.toThrow(/valid email/i);
  });
});
