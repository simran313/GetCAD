import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0068 — client verification before the portal opens (owner, 16 Nov 2026).
 * A self sign-up is PENDING and cannot order; the client submits business
 * details and a proof of registration; an admin approves (ACTIVE, every
 * client feature unlocks) or declines with a reason the client sees.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const lead = id("lead");
const jeweler = id("jeweler");
const stranger = id("stranger");
const promoted = id("promoted");
const toDesigner = id("todesigner");
const teamOpened = id("teamopened");

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query("INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE'), ($2,'QC','ACTIVE')", [admin, lead]);
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
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
const status = async (user: string) => (await db.query("SELECT status FROM users WHERE id = $1", [user])).rows[0]?.status;
const mine = async (user: string) => (await q(user, "SELECT public.my_client_verification() AS v")).rows[0].v;
const newOrder = (user: string) => q(user, "SELECT public.create_order($1,'RING','USD')", [`ord_${Math.random().toString(36).slice(2, 10)}`]);
const addDoc = (user: string, name = "ein.pdf", key = `clients/${user}/${Math.random().toString(36).slice(2)}.pdf`) =>
  q(user, "SELECT public.add_client_verification_document('EIN_LETTER', $1, $2, 'application/pdf', 2048) AS id", [key, name]);
const submit = (user: string) =>
  q(user, "SELECT public.submit_client_verification('RETAIL_JEWELER','United States','12 Main St, Austin, TX','https://example-jewels.com','Owner') AS r");

describe("a self sign-up waits for approval", () => {
  it("starts PENDING and cannot open an order", async () => {
    await q(jeweler, "SELECT public.ensure_self()");
    expect(await status(jeweler)).toBe("PENDING");
    await expect(newOrder(jeweler)).rejects.toThrow(/not verified yet/);
    expect((await mine(jeweler)).state).toBeNull();
    expect((await mine(jeweler)).has_profile).toBe(false);
  });

  it("must add the business and a proof before submitting", async () => {
    await expect(submit(jeweler)).rejects.toThrow(/business name and contact first/);
    await q(jeweler, "SELECT public.save_client_profile('Example Jewels','Nina Rao','nina@example-jewels.com','+1 512 555 0100')");
    await expect(submit(jeweler)).rejects.toThrow(/at least one proof/);
  });

  it("keeps proofs in the client's own folder, five at most", async () => {
    await expect(addDoc(jeweler, "x.pdf", `clients/${stranger}/x.pdf`)).rejects.toThrow(/not in this account's folder/);
    const first = (await addDoc(jeweler)).rows[0].id as string;
    for (let i = 0; i < 4; i++) await addDoc(jeweler, `p${i}.pdf`);
    await expect(addDoc(jeweler, "sixth.pdf")).rejects.toThrow(/five documents at most/);
    const key = (await q(jeweler, "SELECT public.remove_my_verification_document($1) AS k", [first])).rows[0].k;
    expect(key).toMatch(new RegExp(`^clients/${jeweler}/`));
    expect((await mine(jeweler)).documents).toHaveLength(4);
  });

  it("submits, tells the admins, and acknowledges by email", async () => {
    expect((await submit(jeweler)).rows[0].r.state).toBe("SUBMITTED");
    expect((await mine(jeweler)).state).toBe("SUBMITTED");
    const notes = await db.query("SELECT summary FROM notifications WHERE user_id = $1 AND kind = 'CLIENT_VERIFICATION'", [admin]);
    expect(notes.rows[0]?.summary).toBe("New business to verify: Example Jewels");
    const mail = await db.query("SELECT 1 FROM email_outbox WHERE template = 'CLIENT_VERIFICATION_RECEIVED' AND recipient_email = 'nina@example-jewels.com'");
    expect(mail.rowCount).toBe(1);
  });

  it("cannot read or touch the tables directly", async () => {
    await expect(q(jeweler, "SELECT * FROM client_verifications")).rejects.toThrow(/permission denied/);
    await expect(q(jeweler, "SELECT * FROM client_verification_documents")).rejects.toThrow(/permission denied/);
  });
});

describe("only an admin decides", () => {
  it("refuses a pod lead and the client", async () => {
    for (const who of [lead, jeweler]) {
      await expect(q(who, "SELECT * FROM public.admin_client_verifications()")).rejects.toThrow(/only an admin/);
      await expect(q(who, "SELECT public.approve_client($1)", [jeweler])).rejects.toThrow(/only an admin/);
      await expect(q(who, "SELECT * FROM public.client_verification_documents_for($1)", [jeweler])).rejects.toThrow(/only an admin/);
    }
  });

  it("lists the pending business with its details and opens a proof as an audited identity read", async () => {
    const rows = (await q(admin, "SELECT * FROM public.admin_client_verifications()")).rows;
    const row = rows.find((r) => r.user_id === jeweler);
    expect(row).toMatchObject({ business_name: "Example Jewels", state: "SUBMITTED", country: "United States", documents: 4 });
    const docs = (await q(admin, "SELECT * FROM public.client_verification_documents_for($1)", [jeweler])).rows;
    await q(admin, "SELECT * FROM public.client_verification_document_open($1)", [docs[0].id]);
    const audit = await db.query(
      "SELECT is_identity_read FROM audit.audit_log WHERE action = 'CLIENT_VERIFICATION_DOCUMENT_OPENED' AND entity_id = $1",
      [jeweler],
    );
    expect(audit.rows[0].is_identity_read).toBe(true);
  });

  it("declines only with a reason, which the client sees, and the client may submit again", async () => {
    await expect(q(admin, "SELECT public.reject_client_verification($1, 'no')", [jeweler])).rejects.toThrow(/say why/);
    await q(admin, "SELECT public.reject_client_verification($1, 'The EIN letter is not readable; please upload a clearer copy.')", [jeweler]);
    const v = await mine(jeweler);
    expect(v.state).toBe("REJECTED");
    expect(v.decision_reason).toMatch(/clearer copy/);
    expect(await status(jeweler)).toBe("PENDING");
    expect((await db.query("SELECT 1 FROM email_outbox WHERE template = 'CLIENT_VERIFICATION_DECLINED'")).rowCount).toBe(1);

    await submit(jeweler);
    expect((await mine(jeweler)).state).toBe("SUBMITTED");
    expect((await mine(jeweler)).decision_reason).toBeNull();
  });

  it("approves: the account is ACTIVE, orders open, and the client is told", async () => {
    await q(admin, "SELECT public.approve_client($1)", [jeweler]);
    expect(await status(jeweler)).toBe("ACTIVE");
    expect((await mine(jeweler)).state).toBe("APPROVED");
    await expect(newOrder(jeweler)).resolves.toBeTruthy();
    const note = await db.query("SELECT summary FROM notifications WHERE user_id = $1 AND kind = 'ACCOUNT'", [jeweler]);
    expect(note.rows.at(-1)?.summary).toMatch(/unlocked/);
    expect((await db.query("SELECT 1 FROM email_outbox WHERE template = 'CLIENT_APPROVED'")).rowCount).toBe(1);
    // Nothing left to submit or remove once approved.
    await expect(submit(jeweler)).rejects.toThrow(/already verified/);
    await expect(q(admin, "SELECT public.approve_client($1)", [jeweler])).rejects.toThrow(/not waiting/);
    const audit = await db.query("SELECT action FROM audit.audit_log WHERE entity_id = $1 ORDER BY seq", [jeweler]);
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["CLIENT_VERIFICATION_SUBMITTED", "CLIENT_VERIFICATION_REJECTED", "CLIENT_APPROVED"]),
    );
  });
});

describe("accounts the team vouches for", () => {
  it("approves a pending sign-up the team opens as a client", async () => {
    await q(teamOpened, "SELECT public.ensure_self()");
    expect(await status(teamOpened)).toBe("PENDING");
    await q(admin, "SELECT public.register_client($1,'Team Gems','Ravi','ravi@teamgems.example')", [teamOpened]);
    expect(await status(teamOpened)).toBe("ACTIVE");
  });

  it("activates a pending sign-up promoted to a team role; a designer still signs the agreement first", async () => {
    await q(promoted, "SELECT public.ensure_self()");
    await q(toDesigner, "SELECT public.ensure_self()");
    await q(admin, "SELECT public.set_user_role($1,'QC')", [promoted]);
    await q(admin, "SELECT public.set_user_role($1,'DESIGNER')", [toDesigner]);
    expect(await status(promoted)).toBe("ACTIVE");
    expect(await status(toDesigner)).toBe("PENDING");
  });

  it("refuses an order from a suspended client too", async () => {
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [jeweler]);
    await expect(newOrder(jeweler)).rejects.toThrow(/not verified yet/);
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [jeweler]);
  });
});
