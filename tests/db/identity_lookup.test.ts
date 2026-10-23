import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * 0038: only an admin may look up who an account belongs to, and every
 * lookup is an identity-piercing read in the audit log.
 */

let db: Client;

const admin = generateId();
const opsOnly = generateId();
const designer = generateId();
const client = generateId();

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

const lookup = (sub: string, ids: string[], purpose = "access screen") =>
  asUser(sub, () => db.query("SELECT public.record_identity_lookup($1, $2) AS n", [ids, purpose]));

const identityReads = async () =>
  (
    await db.query(
      "SELECT actor_id, payload, is_identity_read FROM audit.audit_log WHERE action = 'IDENTITY_VIEWED' ORDER BY seq",
    )
  ).rows;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'OPS','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'CLIENT','ACTIVE')`,
    [admin, opsOnly, designer, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
});

afterAll(async () => {
  if (db) await db.end();
});

describe("record_identity_lookup", () => {
  it("refuses everyone who is not an admin — OPS alone included", async () => {
    for (const who of [opsOnly, designer, client]) {
      await expect(lookup(who, [client])).rejects.toThrow(/only an admin/i);
    }
    expect(await identityReads()).toEqual([]);
  });

  it("an empty lookup is the admin check and records nothing", async () => {
    expect((await lookup(admin, [])).rows[0].n).toBe(0);
    expect(await identityReads()).toEqual([]);
  });

  it("records who looked, at whom, as an identity-piercing read", async () => {
    const res = await lookup(admin, [client, designer, "not_a_user"]);
    expect(res.rows[0].n).toBe(2);
    const [entry] = await identityReads();
    expect(entry.actor_id).toBe(admin);
    expect(entry.is_identity_read).toBe(true);
    expect(entry.payload).toEqual({
      purpose: "access screen",
      user_ids: [client, designer].sort(),
      count: 2,
    });
  });

  it("needs a purpose", async () => {
    await expect(lookup(admin, [client], "  ")).rejects.toThrow(/needs a purpose/i);
  });

  it("keeps the audit chain intact", async () => {
    const v = await db.query("SELECT audit.verify_chain() AS v");
    expect(v.rows[0].v.valid).toBe(true);
  });
});
