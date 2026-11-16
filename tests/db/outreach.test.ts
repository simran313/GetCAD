import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0069 — outreach (owner, 16 Nov 2026; DECISIONS 1.32). The team's record of
 * who it writes to, from which address, and what came back. Admins see and
 * do everything; a SALES rep sees only the contacts they own; nobody else
 * gets in, and nothing reaches the tables except through the functions.
 * Emails here are example.com / example.org addresses, never real ones.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const rep = id("rep");
const rep2 = id("reptwo");
const opsOnly = id("ops");
const lead = id("lead");
const jeweler = id("jeweler");

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    "INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'SALES','ACTIVE'), ($3,'SALES','ACTIVE'), ($4,'OPS','ACTIVE'), ($5,'QC','ACTIVE')",
    [admin, rep, rep2, opsOnly, lead],
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
const saveSender = (who: string, label: string, address: string, forKind: string, owner: string | null = null) =>
  q(who, "SELECT public.outreach_save_sender(NULL, $1, 'EMAIL', $2, $3, NULL, 20, $4, true) AS id", [label, address, forKind, owner]);
const importRows = (who: string, kind: string, rows: unknown[], importId: string | null = null, sender: string | null = null) =>
  q(who, "SELECT public.outreach_import($1, $2, 'list.csv', 'Trade directory', $3, $4::jsonb) AS r", [
    importId,
    kind,
    sender,
    JSON.stringify(rows),
  ]).then((r) => r.rows[0].r);
const list = (who: string, args: { kind?: string; stage?: string; due?: boolean; search?: string; sender?: string } = {}) =>
  q(who, "SELECT * FROM public.outreach_contacts_list($1, $2, $3, NULL, $4, $5, 200, 0)", [
    args.kind ?? null,
    args.stage ?? null,
    args.sender ?? null,
    args.search ?? null,
    args.due ?? false,
  ]).then((r) => r.rows);
const byEmail = async (email: string) => (await db.query("SELECT * FROM outreach_contacts WHERE email = $1", [email])).rows[0];

let coldA: string;
let coldB: string;
let warm: string;

describe("who may use outreach", () => {
  it("refuses everyone but admins and sales", async () => {
    for (const who of [opsOnly, lead]) {
      await expect(q(who, "SELECT public.outreach_dashboard()")).rejects.toThrow(/outreach is for admins and sales/);
      await expect(q(who, "SELECT * FROM public.outreach_contacts_list()")).rejects.toThrow(/outreach is for admins and sales/);
    }
    await q(jeweler, "SELECT public.ensure_self()");
    await expect(q(jeweler, "SELECT public.outreach_dashboard()")).rejects.toThrow(/outreach is for admins and sales/);
  });

  it("keeps the tables closed to direct reads, even for an admin", async () => {
    for (const t of ["outreach_contacts", "outreach_senders", "outreach_activities", "outreach_imports"]) {
      await expect(q(admin, `SELECT * FROM ${t}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("lets signed-out visitors call none of it", async () => {
    const { rows } = await db.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname LIKE 'outreach%' AND has_function_privilege('anon', p.oid, 'EXECUTE')`,
    );
    expect(rows).toEqual([]);
  });
});

describe("senders", () => {
  it("are set up by an admin only, one per address, handed only to SALES", async () => {
    coldA = (await saveSender(admin, "Cold A", "Hello@Example-Cad.com", "PROSPECT")).rows[0].id;
    coldB = (await saveSender(admin, "Cold B", "team@example-cad.com", "PROSPECT", rep)).rows[0].id;
    warm = (await saveSender(admin, "Main", "simran@example.org", "EXISTING")).rows[0].id;
    await expect(saveSender(admin, "Again", "hello@example-cad.com", "ANY")).rejects.toThrow(/already a sender/);
    await expect(saveSender(admin, "Bad", "not-an-email", "ANY")).rejects.toThrow(/not valid/);
    await expect(saveSender(admin, "Lead", "lead@example-cad.com", "ANY", lead)).rejects.toThrow(/SALES role/);
    await expect(saveSender(rep, "Mine", "rep@example-cad.com", "ANY")).rejects.toThrow(/only an admin/);

    const all = (await q(admin, "SELECT * FROM public.outreach_senders_list()")).rows;
    expect(all.map((s) => s.address).sort()).toEqual(["hello@example-cad.com", "simran@example.org", "team@example-cad.com"]);
    const own = (await q(rep, "SELECT * FROM public.outreach_senders_list()")).rows;
    expect(own.map((s) => s.label)).toEqual(["Cold B"]);
    expect(own[0].owner_name).toBe("Aman");
  });
});

describe("importing a list", () => {
  let importId: string;

  it("adds new rows, skips repeats, clients and unusable rows, and says why", async () => {
    await q(jeweler, "SELECT public.save_client_profile('Client Jewels','Cara Client','cara@example.com','+1 512 555 0100')");
    const rows = [
      { _row: 2, business_name: "Bright Bridal", contact_name: "Ana", email: "ANA@bright-bridal.example.com", city: "Austin", region: "TX", country: "US", segment: "Bridal jeweler", tags: "bridal, texas" },
      { _row: 3, business_name: "Cast House", email: "orders@casthouse.example.com", segment: "Casting factory" },
      { _row: 4, business_name: "Cast House again", email: "Orders@CastHouse.example.com" },
      { _row: 5, business_name: "Already a client", email: "cara@example.com" },
      { _row: 6, business_name: "No way to reach" },
      { _row: 7, email: "broken@" },
      { _row: 8, business_name: "Insta Only", instagram: "https://www.instagram.com/Insta.Only/" },
      { _row: 9, business_name: "Phone Only", phone: "+1 (212) 555-0199" },
    ];
    const r = await importRows(admin, "PROSPECT", rows);
    importId = r.import_id;
    expect(r).toMatchObject({ total: 8, added: 4, duplicates: 1, skipped_clients: 1, invalid: 2 });
    expect(r.errors).toEqual([
      { row: 6, error: "needs a way to reach them: email, phone, WhatsApp, Instagram or LinkedIn" },
      { row: 7, error: "email is not valid" },
    ]);

    const ana = await byEmail("ana@bright-bridal.example.com");
    expect(ana).toMatchObject({ kind: "PROSPECT", segment: "RETAIL_JEWELER", city: "Austin", source: "Trade directory", stage: "NEW" });
    expect(ana.tags.sort()).toEqual(["bridal", "texas"]);
    expect((await byEmail("orders@casthouse.example.com")).segment).toBe("MANUFACTURER");
    const insta = (await db.query("SELECT instagram FROM outreach_contacts WHERE business_name = 'Insta Only'")).rows[0];
    expect(insta.instagram).toBe("insta.only");
  });

  it("spreads prospects evenly over the prospect senders, and the sender's owner owns the contact", async () => {
    const counts = (await db.query("SELECT sender_id, owner_id, count(*)::int AS n FROM outreach_contacts GROUP BY 1, 2")).rows;
    expect(counts.find((c) => c.sender_id === warm)).toBeUndefined();
    expect(counts.find((c) => c.sender_id === coldA)).toMatchObject({ owner_id: admin, n: 2 });
    expect(counts.find((c) => c.sender_id === coldB)).toMatchObject({ owner_id: rep, n: 2 });
  });

  it("adds a second part to the same import, catching repeats by phone and Instagram", async () => {
    const r = await importRows(
      admin,
      "PROSPECT",
      [
        { business_name: "Phone Only (dup)", whatsapp: "12125550199" },
        { business_name: "Insta (dup)", instagram: "@insta.only" },
        { business_name: "Fresh Studio", email: "hi@fresh.example.com", segment: "design studio" },
      ],
      importId,
    );
    expect(r).toMatchObject({ import_id: importId, added: 1, duplicates: 2 });
    const imp = (await q(admin, "SELECT * FROM public.outreach_imports_list()")).rows.find((i) => i.id === importId);
    expect(imp).toMatchObject({ total: 11, added: 5, duplicates: 3, skipped_clients: 1, invalid: 2, by_name: "Simran" });
    await expect(importRows(rep, "PROSPECT", [], importId)).rejects.toThrow(/no such import/);
  });

  it("sends the owner's own contacts through the main-domain sender", async () => {
    const r = await importRows(admin, "EXISTING", [{ business_name: "Old Friend Jewelers", email: "owner@oldfriend.example.com" }]);
    expect(r.added).toBe(1);
    expect((await byEmail("owner@oldfriend.example.com")).sender_id).toBe(warm);
  });

  it("refuses more than 500 rows in one part", async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ email: `p${i}@bulk.example.com` }));
    await expect(importRows(admin, "PROSPECT", many)).rejects.toThrow(/500 rows at most/);
  });
});

describe("a rep's own book", () => {
  it("sees only the contacts they own, and cannot open anyone else's", async () => {
    const mine = await list(rep);
    expect(mine.length).toBe(2);
    expect(mine.every((c) => c.owner_id === rep && c.sender_label === "Cold B")).toBe(true);
    expect(await list(rep2)).toEqual([]);

    const other = await byEmail("owner@oldfriend.example.com");
    await expect(q(rep, "SELECT public.outreach_contact($1)", [other.id])).rejects.toThrow(/no such contact/);
    await expect(q(rep, "SELECT public.outreach_log($1, 'SENT', 'EMAIL')", [other.id])).rejects.toThrow(/no such contact/);
    await expect(q(rep, "SELECT public.outreach_assign(ARRAY[$1], NULL, $2)", [other.id, rep])).rejects.toThrow(/only an admin/);
    await expect(q(rep, "SELECT * FROM public.outreach_team()")).rejects.toThrow(/only an admin/);
  });

  it("imports their own research, owned by them, through their own sender", async () => {
    const r = await importRows(rep, "PROSPECT", [{ business_name: "Rep Find", email: "find@rep.example.com" }]);
    expect(r.added).toBe(1);
    expect(await byEmail("find@rep.example.com")).toMatchObject({ owner_id: rep, sender_id: coldB });
    await expect(importRows(rep, "PROSPECT", [], null, coldA)).rejects.toThrow(/no such active sender/);
  });

  it("gets a dashboard of their own contacts only, with no money", async () => {
    const d = (await q(rep, "SELECT public.outreach_dashboard() AS d")).rows[0].d;
    expect(d.is_admin).toBe(false);
    expect(d.totals.contacts).toBe(3);
    expect(d.senders.map((s: { label: string }) => s.label)).toEqual(["Cold B"]);
    expect(d.owners).toEqual([]);
  });
});

describe("working a contact", () => {
  it("moves from New to Contacted on a send, and is due again on day 4 (0070's sequence)", async () => {
    const ana = await byEmail("ana@bright-bridal.example.com");
    await q(admin, "SELECT public.outreach_log($1, 'SENT', 'EMAIL', 'Intro email')", [ana.id]);
    const after = await byEmail("ana@bright-bridal.example.com");
    expect(after).toMatchObject({ stage: "CONTACTED", touches: 1 });
    const days = (new Date(after.next_follow_up_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });

  it("shows up as due once the date passes, and as Replied when they answer", async () => {
    const ana = await byEmail("ana@bright-bridal.example.com");
    await q(admin, "SELECT public.outreach_log($1, 'NOTE', NULL, 'Asked to call back', now() - interval '1 hour')", [ana.id]);
    expect((await list(admin, { due: true })).map((c) => c.id)).toContain(ana.id);
    await expect(q(admin, "SELECT public.outreach_log($1, 'NOTE', NULL, '  ')", [ana.id])).rejects.toThrow(/write the note/);

    await q(admin, "SELECT public.outreach_log($1, 'REPLIED', 'EMAIL', 'Wants a price for a halo')", [ana.id]);
    const after = await byEmail("ana@bright-bridal.example.com");
    expect(after.stage).toBe("REPLIED");
    expect(after.replied_at).not.toBeNull();
    expect(after.next_follow_up_at).toBeNull();

    await q(admin, "SELECT public.outreach_set_stage($1, 'INTERESTED')", [ana.id]);
    const c = (await q(admin, "SELECT public.outreach_contact($1) AS c", [ana.id])).rows[0].c;
    expect(c.stage).toBe("INTERESTED");
    expect(c.sender.label).toBe("Cold A");
    expect(c.phone_key).toBeUndefined();
    expect(c.activities.map((a: { kind: string }) => a.kind)).toEqual(["STAGE", "REPLIED", "NOTE", "SENT", "IMPORTED"]);
    expect(c.activities[0].body).toBe("REPLIED → INTERESTED");
    expect(c.activities[1].actor_name).toBe("Simran");
  });

  it("never writes to someone marked do-not-contact, and never imports them again", async () => {
    const cast = await byEmail("orders@casthouse.example.com");
    await expect(q(admin, "SELECT public.outreach_set_dnc($1, true, '')", [cast.id])).rejects.toThrow(/say why/);
    await q(admin, "SELECT public.outreach_set_dnc($1, true, 'Asked to be removed')", [cast.id]);
    await expect(q(admin, "SELECT public.outreach_log($1, 'SENT', 'EMAIL')", [cast.id])).rejects.toThrow(/asked not to be contacted/);
    expect((await importRows(admin, "PROSPECT", [{ email: "orders@casthouse.example.com" }])).duplicates).toBe(1);
    expect((await list(admin, { stage: "DNC" })).map((c) => c.id)).toEqual([cast.id]);
  });

  it("edits details, keeping each email on one contact", async () => {
    const fresh = await byEmail("hi@fresh.example.com");
    await q(admin, `SELECT public.outreach_update_contact($1, '{"city":"Denver","contact_name":"Lee","tags":"studio, colorado"}'::jsonb)`, [fresh.id]);
    expect(await byEmail("hi@fresh.example.com")).toMatchObject({ city: "Denver", contact_name: "Lee", segment: "DESIGN_STUDIO" });
    await expect(
      q(admin, `SELECT public.outreach_update_contact($1, '{"email":"ANA@bright-bridal.example.com"}'::jsonb)`, [fresh.id]),
    ).rejects.toThrow(/another contact has this email/);
    await q(admin, `SELECT public.outreach_update_contact($1, '{"city":""}'::jsonb)`, [fresh.id]);
    expect((await byEmail("hi@fresh.example.com")).city).toBeNull();
  });

  it("adds one by hand, refusing clients and repeats", async () => {
    await expect(
      q(admin, `SELECT public.outreach_add_contact('EXISTING', '{"business_name":"X","email":"cara@example.com"}'::jsonb)`),
    ).rejects.toThrow(/belongs to a client already/);
    await expect(
      q(admin, `SELECT public.outreach_add_contact('PROSPECT', '{"business_name":"X","email":"hi@fresh.example.com"}'::jsonb)`),
    ).rejects.toThrow(/already in outreach/);
    const newId = (
      await q(admin, `SELECT public.outreach_add_contact('EXISTING', '{"business_name":"Met at JCK","whatsapp":"+1 702 555 0142"}'::jsonb, $1) AS id`, [
        coldB,
      ])
    ).rows[0].id;
    expect((await db.query("SELECT owner_id, sender_id FROM outreach_contacts WHERE id = $1", [newId])).rows[0]).toEqual({
      owner_id: rep,
      sender_id: coldB,
    });
  });

  it("hands contacts to another rep, who then sees them", async () => {
    const fresh = await byEmail("hi@fresh.example.com");
    await expect(q(admin, "SELECT public.outreach_assign(ARRAY[$1], NULL, $2)", [fresh.id, lead])).rejects.toThrow(/SALES role/);
    expect((await q(admin, "SELECT public.outreach_assign(ARRAY[$1], 'NONE', $2) AS n", [fresh.id, rep2])).rows[0].n).toBe(1);
    expect((await list(rep2)).map((c) => c.id)).toEqual([fresh.id]);
    expect((await byEmail("hi@fresh.example.com")).sender_id).toBeNull();
    const team = (await q(admin, "SELECT * FROM public.outreach_team()")).rows;
    expect(team.map((t) => t.name)).toEqual(["Aman", "Riya", "Simran"]);
    expect(team.find((t) => t.name === "Simran").is_admin).toBe(true);
  });
});

describe("what became of them", () => {
  it("matches a contact who signs up later, and counts them on the dashboard", async () => {
    const later = id("later");
    await q(later, "SELECT public.ensure_self()");
    await q(later, "SELECT public.save_client_profile('Bright Bridal','Ana','Ana@Bright-Bridal.example.com',NULL)");
    await q(admin, "SELECT public.approve_client($1)", [later]);

    const row = (await list(admin, { search: "bright" }))[0];
    expect(row.conversion).toMatchObject({ verified: true, orders: 0, order_value: 0 });
    const repView = (await list(rep, {})).find((c) => c.email === "ana@bright-bridal.example.com");
    expect(repView).toBeUndefined();

    const d = (await q(admin, "SELECT public.outreach_dashboard() AS d")).rows[0].d;
    expect(d.is_admin).toBe(true);
    expect(d.conversion).toEqual([{ kind: "PROSPECT", signed_up: 1, verified: 1, ordered: 0, order_value: 0 }]);
    expect(d.totals).toMatchObject({ do_not_contact: 1, replied: 1, contacted: 1, sent_today: 1 });
    const a = d.senders.find((s: { label: string }) => s.label === "Cold A");
    expect(a).toMatchObject({ contacted: 1, replied: 1, sent_today: 1, clients: 1 });
    expect(d.owners.map((o: { name: string }) => o.name)).toContain("Riya");
  });

  it("changes nothing outside outreach", async () => {
    const touched = await db.query(
      "SELECT count(*)::int AS n FROM audit.audit_log WHERE action LIKE 'OUTREACH%' AND entity_type NOT LIKE 'outreach%'",
    );
    expect(touched.rows[0].n).toBe(0);
    const triggers = await db.query(
      `SELECT tgname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname LIKE 'outreach%' AND NOT t.tgisinternal`,
    );
    expect(triggers.rows).toEqual([]);
  });
});
