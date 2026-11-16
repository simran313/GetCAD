import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0070 — outreach messages (owner, 16 Nov 2026; DECISIONS 1.33): templates,
 * the day 1 / 4 / 10 sequence, the day's work list and the dashboard's
 * charts. Example addresses only.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const rep = id("rep");
const lead = id("lead");

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query("INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'SALES','ACTIVE'), ($3,'QC','ACTIVE')", [admin, rep, lead]);
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran'), ($2,'Aman')", [admin, rep]);
});

afterAll(async () => {
  if (db) await db.end();
});

async function as<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  await db.query("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}
const q = (sub: string, sql: string, params: unknown[] = []) => as(sub, () => db.query(sql, params));
const contact = async (email: string) => (await db.query("SELECT * FROM outreach_contacts WHERE email = $1", [email])).rows[0];
const days = (iso: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / 86_400_000 : null);

describe("templates", () => {
  it("come seeded from the outbound kit, for every channel, with $35 and the 6-hour first look", async () => {
    const t = (await q(rep, "SELECT * FROM public.outreach_templates_list()")).rows;
    expect(t.length).toBeGreaterThanOrEqual(15);
    expect(new Set(t.map((r) => r.channel))).toEqual(new Set(["EMAIL", "WHATSAPP", "INSTAGRAM", "LINKEDIN"]));
    const jeweler1 = t.find((r) => r.list === "PROSPECT" && r.segment === null && r.channel === "EMAIL" && r.step === 1);
    expect(jeweler1.subject).toBe("CAD for {business} custom orders");
    expect(jeweler1.body).toContain("from $35");
    expect(jeweler1.body).toContain("first look within 6 hours");
    for (const step of [1, 2, 3]) {
      expect(t.some((r) => r.list === "EXISTING" && r.channel === "EMAIL" && r.step === step), `existing step ${step}`).toBe(true);
    }
  });

  it("are changed by admins only; an email needs a subject", async () => {
    const save = (who: string, subject: string | null) =>
      q(who, "SELECT public.outreach_save_template(NULL, 'Test', 'ANY', NULL, 'EMAIL', 1, $1, 'Hi {first_name}', true) AS id", [subject]);
    await expect(save(rep, "Hello")).rejects.toThrow(/only an admin/);
    await expect(save(admin, " ")).rejects.toThrow(/needs a subject/);
    const tid = (await save(admin, "Hello {business}")).rows[0].id;
    await q(admin, "SELECT public.outreach_save_template($1, 'Test', 'ANY', NULL, 'EMAIL', 1, 'Hello', 'Hi', false)", [tid]);
    const row = (await q(admin, "SELECT * FROM public.outreach_templates_list()")).rows.find((r) => r.id === tid);
    expect(row).toMatchObject({ subject: "Hello", active: false });
    await expect(q(lead, "SELECT * FROM public.outreach_templates_list()")).rejects.toThrow(/outreach is for admins and sales/);
    await expect(q(admin, "SELECT * FROM outreach_templates")).rejects.toThrow(/permission denied/);
  });
});

describe("the sequence and the day's work", () => {
  let sender: string;
  let template: string;

  beforeAll(async () => {
    sender = (await q(admin, "SELECT public.outreach_save_sender(NULL, 'Cold', 'EMAIL', 'cold@example-cad.com', 'PROSPECT', NULL, 2, $1, true) AS id", [rep])).rows[0].id;
    await q(admin, "SELECT public.outreach_save_sender(NULL, 'Main', 'EMAIL', 'main@example.org', 'EXISTING', NULL, 20, NULL, true)");
    await q(
      admin,
      `SELECT public.outreach_import(NULL, 'PROSPECT', 'p.csv', NULL, NULL, '[
        {"business_name":"A","email":"a@one.example.com"},
        {"business_name":"B","email":"b@two.example.com"},
        {"business_name":"C","email":"c@three.example.com"},
        {"business_name":"Phone only","phone":"+1 212 555 0100"}]'::jsonb)`,
    );
    template = (await q(admin, "SELECT id FROM public.outreach_templates_list() WHERE list = 'PROSPECT' AND segment IS NULL AND channel = 'EMAIL' AND step = 1")).rows[0].id;
  });

  it("offers each sender only as many new contacts as its daily limit allows, and only ones it can reach", async () => {
    const t = (await q(rep, "SELECT public.outreach_today() AS t")).rows[0].t;
    expect(t.is_admin).toBe(false);
    expect(t.start.map((c: { business_name: string }) => c.business_name)).toEqual(["A", "B"]);
    expect(t.start[0]).toMatchObject({ step: 1, sender: { label: "Cold", address: "cold@example-cad.com" } });
    expect(t.senders).toEqual([{ id: sender, label: "Cold", channel: "EMAIL", address: "cold@example-cad.com", daily_limit: 2, sent_today: 0, due: 0 }]);
    expect(t.due).toEqual([]);
  });

  it("records message 1 with its template, then day 4, then day 10, then stops", async () => {
    const a = await contact("a@one.example.com");
    await q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL', NULL, NULL, NULL, $2)", [a.id, template]);
    let after = await contact("a@one.example.com");
    expect(after.touches).toBe(1);
    expect(days(after.next_follow_up_at)).toBeCloseTo(3, 1);
    const act = (await db.query("SELECT template_id, step FROM outreach_activities WHERE contact_id = $1 AND kind = 'SENT'", [a.id])).rows[0];
    expect(act).toEqual({ template_id: template, step: 1 });

    await q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL')", [a.id]);
    after = await contact("a@one.example.com");
    expect(days(after.next_follow_up_at)).toBeCloseTo(6, 1);
    await q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL')", [a.id]);
    after = await contact("a@one.example.com");
    expect(after.next_follow_up_at).toBeNull();
    expect(after.touches).toBe(3);
    const steps = (await db.query("SELECT step FROM outreach_activities WHERE contact_id = $1 AND kind = 'SENT' ORDER BY created_at", [a.id])).rows;
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3]);
    await expect(q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL', NULL, NULL, NULL, 'nope')", [a.id])).rejects.toThrow(/no such template/);
  });

  it("counts today's sends and due follow-ups against the limit, and lists what is due", async () => {
    const b = await contact("b@two.example.com");
    await q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL', NULL, now() - interval '1 hour')", [b.id]);
    const t = (await q(rep, "SELECT public.outreach_today() AS t")).rows[0].t;
    expect(t.due.map((c: { id: string }) => c.id)).toEqual([b.id]);
    expect(t.due[0].step).toBe(2);
    expect(t.senders[0]).toMatchObject({ sent_today: 4, due: 1 });
    expect(t.start).toEqual([]);
  });

  it("credits a reply to the last template sent before it", async () => {
    const a = await contact("a@one.example.com");
    await q(rep, "SELECT public.outreach_log($1, 'REPLIED', 'EMAIL', 'Send me the price list')", [a.id]);
    const stats = (await q(admin, "SELECT * FROM public.outreach_templates_list()")).rows.find((r) => r.id === template);
    expect(Number(stats.sent)).toBe(1);
    // The last send before the reply was message 3 (no template), so message 1 gets no credit.
    expect(Number(stats.replied)).toBe(0);
    const c = await contact("c@three.example.com");
    await q(admin, "SELECT public.outreach_log($1, 'SENT', 'EMAIL', NULL, NULL, NULL, $2)", [c.id, template]);
    await q(admin, "SELECT public.outreach_log($1, 'REPLIED', 'EMAIL')", [c.id]);
    const again = (await q(admin, "SELECT * FROM public.outreach_templates_list()")).rows.find((r) => r.id === template);
    expect(Number(again.replied)).toBe(1);
  });
});

describe("the dashboard's charts", () => {
  it("gives the last 14 days, the funnel numbers and the contacts with no sender", async () => {
    await q(admin, `SELECT public.outreach_add_contact('EXISTING', '{"business_name":"No sender yet","email":"x@none.example.com"}'::jsonb)`);
    const d = (await q(admin, "SELECT public.outreach_dashboard() AS d")).rows[0].d;
    expect(d.daily).toHaveLength(14);
    const today = d.daily[13];
    expect(today.sent).toBe(5);
    expect(today.replied).toBe(2);
    expect(d.daily.slice(0, 13).every((x: { sent: number }) => x.sent === 0)).toBe(true);
    expect(d.totals).toMatchObject({ contacted: 3, replied: 2, interested: 0, no_sender: 1 });
  });
});
