import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * 0061 — the team adds its designers (owner, 4 Nov 2026): name and email,
 * bank details and identity documents entered by an admin, all visible to
 * admins and to nobody else; a pod lead sees the designer only through
 * their pod.
 */
let db: Client;

const id = (s: string) => `user_${s}${Math.random().toString(36).slice(2, 8)}`;
const admin = id("admin");
const ops = id("ops");
const lead = id("lead");
const client = id("client");
const designer = id("designer");
const fresh = id("fresh");

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'CLIENT','ACTIVE'), ($5,'DESIGNER','ACTIVE')`,
    [admin, ops, lead, client, designer],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    "INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES ('dp_x', $1, 'Existing Designer', 'x@example.com')",
    [designer],
  );
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

const register = (who: string, userId: string, name = "Sandip Maity", email = "sandip@example.com") =>
  as(who, () => db.query("SELECT public.register_designer($1,$2,$3,$4) AS r", [userId, name, email, "+91 98765 43210"]));

const BANK = ["Sandip Maity", "abcde1234f", "1234 5678 9012", "sbin0001234", "SAVINGS"] as const;
const setBank = (who: string, userId: string, verified = false) =>
  as(who, () => db.query("SELECT public.set_payout_account_for($1,$2,$3,$4,$5,$6,$7) AS r", [userId, ...BANK, verified]));

const audits = async (action: string, entity: string) =>
  (await db.query("SELECT payload, is_identity_read FROM audit.audit_log WHERE action = $1 AND entity_id = $2", [action, entity])).rows;

describe("register_designer", () => {
  it("only an admin may add a designer", async () => {
    for (const who of [ops, lead, client, designer]) {
      await expect(register(who, fresh)).rejects.toThrow(/only an admin/);
    }
  });

  it("opens a pending designer with a profile, once", async () => {
    const first = (await register(admin, fresh)).rows[0].r;
    expect(first).toMatchObject({ user_id: fresh, new: true });
    const again = (await register(admin, fresh)).rows[0].r;
    expect(again).toMatchObject({ new: false });
    const u = (await db.query("SELECT role, status FROM users WHERE id = $1", [fresh])).rows[0];
    expect(u).toEqual({ role: "DESIGNER", status: "PENDING" });
    const p = (await db.query("SELECT legal_name, email, phone, country FROM designer_profiles WHERE user_id = $1", [fresh])).rows;
    expect(p).toEqual([{ legal_name: "Sandip Maity", email: "sandip@example.com", phone: "+91 98765 43210", country: "IN" }]);
    expect(await audits("DESIGNER_REGISTERED_BY_TEAM", fresh)).toHaveLength(2);
  });

  it("refuses a client's or a team account, a bad id, a bad email", async () => {
    await expect(register(admin, client)).rejects.toThrow(/not a designer/);
    await expect(register(admin, lead)).rejects.toThrow(/not a designer/);
    await expect(register(admin, "not-a-clerk-id")).rejects.toThrow(/sign-in account id/);
    await expect(register(admin, id("x"), "Name", "nope")).rejects.toThrow(/valid email/);
  });

  it("a pending designer can be placed in a pod", async () => {
    const pod = (await db.query("INSERT INTO pods (name) VALUES ('Pod A') RETURNING id")).rows[0].id;
    await as(admin, () => db.query("SELECT public.set_pod_member($1,$2,'DESIGNER')", [pod, fresh]));
    const row = (await as(admin, () => db.query("SELECT * FROM public.admin_designers() WHERE user_id = $1", [fresh]))).rows[0];
    expect(row).toMatchObject({ pod_name: "Pod A", status: "PENDING", agreement_signed: false, documents: 0 });
  });
});

describe("bank details by the team", () => {
  it("only an admin may set or read them", async () => {
    for (const who of [ops, lead, client, designer]) {
      await expect(setBank(who, fresh)).rejects.toThrow(/only an admin/);
      await expect(as(who, () => db.query("SELECT * FROM public.payout_account_full($1)", [fresh]))).rejects.toThrow(/only an admin/);
    }
  });

  it("stores them cleaned, pending unless checked against the documents", async () => {
    expect((await setBank(admin, fresh)).rows[0].r).toMatchObject({ status: "PENDING_VERIFICATION", account_last4: "9012" });
    const full = (await as(admin, () => db.query("SELECT * FROM public.payout_account_full($1)", [fresh]))).rows[0];
    expect(full).toMatchObject({ beneficiary_name: "Sandip Maity", pan: "ABCDE1234F", account_number: "123456789012", ifsc: "SBIN0001234" });
    expect((await setBank(admin, fresh, true)).rows[0].r).toMatchObject({ status: "VERIFIED" });
  });

  it("writes fragments to the audit log, and each full read as an identity read", async () => {
    const set = await audits("PAYOUT_ACCOUNT_SET_BY_TEAM", fresh);
    expect(set.length).toBeGreaterThan(0);
    expect(JSON.stringify(set)).not.toMatch(/123456789012|ABCDE1234F/);
    const reads = await audits("PAYOUT_ACCOUNT_READ", fresh);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.is_identity_read)).toBe(true);
  });

  it("refuses a client and bad fields", async () => {
    await expect(setBank(admin, client)).rejects.toThrow(/designer or pod lead/);
    await expect(
      as(admin, () => db.query("SELECT public.set_payout_account_for($1,'Name','BAD','123456789','SBIN0001234','SAVINGS')", [fresh])),
    ).rejects.toThrow(/PAN must be/);
  });
});

describe("identity documents", () => {
  const add = (who: string, userId: string, key: string, kind = "PAN_CARD") =>
    as(who, () =>
      db.query("SELECT public.add_designer_document($1,$2,$3,'pan.jpg','image/jpeg',2048) AS id", [userId, kind, key]),
    );

  it("only an admin may add, list, open or remove", async () => {
    for (const who of [ops, lead, client, designer]) {
      await expect(add(who, fresh, `designers/${fresh}/a.jpg`)).rejects.toThrow(/only an admin/);
      await expect(as(who, () => db.query("SELECT * FROM public.designer_documents_for($1)", [fresh]))).rejects.toThrow(/only an admin/);
    }
  });

  it("keeps a file only inside the designer's own folder, of a known kind", async () => {
    await expect(add(admin, fresh, `designers/${designer}/a.jpg`)).rejects.toThrow(/this designer's folder/);
    await expect(add(admin, fresh, `designers/${fresh}/a.jpg`, "PASSPORT")).rejects.toThrow();
    await expect(add(admin, client, `designers/${client}/a.jpg`)).rejects.toThrow(/designers and pod leads/);
  });

  it("lists, opens (audited) and removes", async () => {
    const docId = (await add(admin, fresh, `designers/${fresh}/pan.jpg`)).rows[0].id;
    await add(admin, fresh, `designers/${fresh}/aadhaar.pdf`, "AADHAAR");
    const list = (await as(admin, () => db.query("SELECT * FROM public.designer_documents_for($1)", [fresh]))).rows;
    expect(list.map((d) => d.kind).sort()).toEqual(["AADHAAR", "PAN_CARD"]);
    expect(Object.keys(list[0])).not.toContain("object_key");

    for (const who of [lead, designer]) {
      await expect(as(who, () => db.query("SELECT * FROM public.designer_document_open($1)", [docId]))).rejects.toThrow(/only an admin/);
    }
    const open = (await as(admin, () => db.query("SELECT * FROM public.designer_document_open($1)", [docId]))).rows[0];
    expect(open.object_key).toBe(`designers/${fresh}/pan.jpg`);
    const opened = await audits("DESIGNER_DOCUMENT_OPENED", fresh);
    expect(opened.some((r) => r.is_identity_read)).toBe(true);

    const key = (await as(admin, () => db.query("SELECT public.remove_designer_document($1) AS k", [docId]))).rows[0].k;
    expect(key).toBe(`designers/${fresh}/pan.jpg`);
    const after = (await as(admin, () => db.query("SELECT * FROM public.designer_documents_for($1)", [fresh]))).rows;
    expect(after.map((d) => d.kind)).toEqual(["AADHAAR"]);
    const row = (await as(admin, () => db.query("SELECT documents FROM public.admin_designers() WHERE user_id = $1", [fresh]))).rows[0];
    expect(row.documents).toBe(1);
  });

  it("nobody reads the table directly", async () => {
    for (const who of [admin, lead, designer, client]) {
      await expect(as(who, () => db.query("SELECT * FROM designer_documents"))).rejects.toThrow(/permission denied/);
    }
  });
});
