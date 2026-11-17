import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0071 — outreach research (owner, 17 Nov 2026; DECISIONS 1.34): research
 * areas, the detail and fit grade on a prospect, repeats caught by website
 * domain, the live check, and Today offering strong fits first.
 * Example addresses only.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const rep = id("rep");
const rep2 = id("reptwo");
const lead = id("lead");

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    "INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'SALES','ACTIVE'), ($3,'SALES','ACTIVE'), ($4,'QC','ACTIVE')",
    [admin, rep, rep2, lead],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran'), ($2,'Aman'), ($3,'Riya')", [admin, rep, rep2]);
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
const saveArea = (who: string, args: { id?: string | null; segment?: string; city?: string; region?: string; status?: string; owner?: string | null }) =>
  q(who, "SELECT public.outreach_save_area($1, $2, $3, $4, NULL, $5, $6, NULL) AS id", [
    args.id ?? null,
    args.segment ?? "RETAIL_JEWELER",
    args.city ?? "Austin",
    args.region ?? "TX",
    args.status ?? "TODO",
    args.owner ?? null,
  ]).then((r) => r.rows[0].id as string);
const add = (who: string, fields: Record<string, unknown>) =>
  q(who, "SELECT public.outreach_add_contact('PROSPECT', $1::jsonb) AS id", [JSON.stringify(fields)]).then((r) => r.rows[0].id as string);
const check = (who: string, fields: Record<string, unknown>) =>
  q(who, "SELECT public.outreach_check($1::jsonb) AS c", [JSON.stringify(fields)]).then((r) => r.rows[0].c);

let austin: string;

describe("research areas", () => {
  it("are shared, one per place and business type, and refused to anyone outside outreach", async () => {
    austin = await saveArea(rep, { city: "Austin", region: "TX" });
    await expect(saveArea(admin, { city: "austin", region: "tx" })).rejects.toThrow(/already on the list/);
    await saveArea(admin, { city: "Austin", region: "TX", segment: "MANUFACTURER" });
    const list = (await q(rep2, "SELECT * FROM public.outreach_areas_list()")).rows;
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.id === austin)).toMatchObject({ owner_name: "Aman", country: "United States", status: "TODO" });
    await expect(q(lead, "SELECT * FROM public.outreach_areas_list()")).rejects.toThrow(/outreach is for admins and sales/);
    await expect(q(admin, "SELECT * FROM outreach_areas")).rejects.toThrow(/permission denied/);
  });

  it("are worked by their owner: a rep cannot take another rep's area or hand one away", async () => {
    await expect(saveArea(rep2, { id: austin, status: "IN_PROGRESS" })).rejects.toThrow(/someone else is researching/);
    await expect(saveArea(rep2, { city: "Dallas", owner: rep })).rejects.toThrow(/only an admin may hand/);
    await saveArea(rep, { id: austin, status: "IN_PROGRESS" });
    await saveArea(admin, { id: austin, status: "IN_PROGRESS", owner: rep2 });
    expect((await q(rep2, "SELECT * FROM public.outreach_areas_list()")).rows.find((a) => a.id === austin).owner_name).toBe("Riya");
    await expect(saveArea(admin, { id: austin, owner: lead })).rejects.toThrow(/SALES role/);
  });
});

describe("capturing a prospect", () => {
  let sender: string;

  beforeAll(async () => {
    // Handled by Riya: a rep's research goes only to senders they handle.
    sender = (await q(admin, "SELECT public.outreach_save_sender(NULL, 'Cold', 'EMAIL', 'cold@example-cad.com', 'PROSPECT', NULL, 20, $1, true) AS id", [rep2])).rows[0].id;
  });

  it("keeps the detail and fit grade, links the area and goes to a prospect sender", async () => {
    const cid = await add(rep2, {
      business_name: "Bright Bridal",
      email: "ana@bright.example.com",
      website: "https://www.bright.example.com/about",
      city: "Austin",
      region: "TX",
      detail: "the halo ring you posted last week",
      fit: "a",
      area_id: austin,
    });
    const c = (await db.query("SELECT * FROM outreach_contacts WHERE id = $1", [cid])).rows[0];
    expect(c).toMatchObject({ detail: "the halo ring you posted last week", fit: "A", area_id: austin, sender_id: sender, owner_id: rep2 });
    expect(c.website_key).toBe("bright.example.com");
    const area = (await q(admin, "SELECT * FROM public.outreach_areas_list()")).rows.find((a) => a.id === austin);
    expect(Number(area.prospects)).toBe(1);
    expect(Number(area.added_7d)).toBe(1);
    await expect(add(rep2, { business_name: "X", email: "x@example.com", area_id: "nope" })).rejects.toThrow(/no such research area/);
  });

  it("says before research starts whether a business is already in outreach or a client, and by what", async () => {
    expect(await check(rep, { website: "http://bright.example.com" })).toEqual({ state: "DUPLICATE", by: "website" });
    expect(await check(rep, { email: "ANA@bright.example.com" })).toEqual({ state: "DUPLICATE", by: "email" });
    expect(await check(rep, { website: "https://www.instagram.com/brightbridal" })).toEqual({ state: null, by: null });
    expect(await check(rep, { website: "new-store.example.com" })).toEqual({ state: null, by: null });
    await expect(add(rep, { business_name: "Bright again", website: "bright.example.com/rings", phone: "+1 512 555 0100" })).rejects.toThrow(
      /already in outreach/,
    );

    const jeweler = id("jeweler");
    await q(jeweler, "SELECT public.ensure_self()");
    await q(jeweler, "SELECT public.save_client_profile('Client Co','Cara','cara@client.example.com',NULL)");
    expect(await check(rep, { email: "cara@client.example.com" })).toEqual({ state: "CLIENT", by: "email" });
    await expect(q(lead, "SELECT public.outreach_check('{}'::jsonb)")).rejects.toThrow(/outreach is for admins and sales/);
  });

  it("imports detail and fit columns, and edits them", async () => {
    const r = (
      await q(admin, `SELECT public.outreach_import(NULL, 'PROSPECT', 'r.csv', NULL, NULL,
        '[{"business_name":"Weak fit","email":"w@weak.example.com","fit":"weak"},
          {"business_name":"Ungraded","email":"u@ungraded.example.com"},
          {"business_name":"Strong","email":"s@strong.example.com","fit":"A","detail":"your bridal page"}]'::jsonb) AS r`)
    ).rows[0].r;
    expect(r.added).toBe(3);
    const rows = (await db.query("SELECT business_name, fit, detail FROM outreach_contacts WHERE email LIKE '%.example.com' AND business_name IN ('Weak fit','Ungraded','Strong') ORDER BY business_name")).rows;
    expect(rows).toEqual([
      { business_name: "Strong", fit: "A", detail: "your bridal page" },
      { business_name: "Ungraded", fit: null, detail: null },
      { business_name: "Weak fit", fit: "C", detail: null },
    ]);
    const weak = (await db.query("SELECT id FROM outreach_contacts WHERE business_name = 'Weak fit'")).rows[0].id;
    await q(admin, `SELECT public.outreach_update_contact($1, '{"fit":"B","detail":"the signet in your window"}'::jsonb)`, [weak]);
    expect((await db.query("SELECT fit, detail FROM outreach_contacts WHERE id = $1", [weak])).rows[0]).toEqual({ fit: "B", detail: "the signet in your window" });
  });

  it("offers the strongest fits first on Today, with their detail", async () => {
    const t = (await q(admin, "SELECT public.outreach_today() AS t")).rows[0].t;
    expect(t.start.map((c: { business_name: string }) => c.business_name)).toEqual(["Bright Bridal", "Strong", "Weak fit", "Ungraded"]);
    expect(t.start[0]).toMatchObject({ fit: "A", detail: "the halo ring you posted last week" });
  });

  it("counts what research produced, per person", async () => {
    const mine = (await q(rep2, "SELECT public.outreach_research_stats() AS s")).rows[0].s;
    // The imported three went through Riya's sender, so she owns all four.
    expect(mine).toMatchObject({ mine_today: 1, prospects: 4, with_detail: 3 });
    const all = (await q(admin, "SELECT public.outreach_research_stats() AS s")).rows[0].s;
    expect(all.by_person).toEqual([{ name: "Riya", n: 1 }]);
    expect(all.prospects).toBe(4);
  });

  it("fills message 1 with the detail: the seeded templates now use {detail}", async () => {
    const t = (await q(admin, "SELECT * FROM public.outreach_templates_list()")).rows;
    expect(t.find((x) => x.name === "Jeweler · message 1").body).toContain("I saw {detail}. Nice work.");
    expect(t.find((x) => x.name === "Brand · message 1").body).toContain("loved {detail}.");
    expect(t.find((x) => x.name === "Prospect · WhatsApp").body).toContain("I came across {business} and saw {detail}.");
  });
});
