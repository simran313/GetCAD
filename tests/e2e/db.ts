import { Client, type QueryResult } from "pg";

import { generateId } from "../../core/ids/generateId";
import { assertDestroyable, TEST_DATABASE_URL } from "../helpers/db";

/**
 * The throwaway e2e database, for what no screen shows or should do:
 * setting the scene (a submitted brief, a missed deadline) and reading back
 * what a screen only implies (one credit, not two). Never anything else.
 */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  // The same guard as the reset: this only ever writes to a local database.
  assertDestroyable(TEST_DATABASE_URL);
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Run one statement as a signed-in user, through their row-level security. */
export async function asUser(db: Client, sub: string, sql: string, params: unknown[] = []): Promise<QueryResult> {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  await db.query("SET ROLE authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

/** Run one statement as the server (service role), e.g. the SLA sweep. */
export async function asService(db: Client, sql: string, params: unknown[] = []): Promise<QueryResult> {
  await db.query("SET ROLE service_role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("RESET ROLE");
  }
}

/**
 * A ring brief sent for a price, as the client: what the brief screens do
 * (journey.e2e.ts drives those), without driving them again.
 */
export async function submittedBrief(db: Client, clientId: string, reference: string): Promise<string> {
  const id = generateId();
  await asUser(db, clientId, "SELECT public.create_order($1,'RING','USD')", [id]);
  await asUser(
    db,
    clientId,
    `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => $2, p_product => 'RING',
                                     p_metal => 'YELLOW', p_ring_size => 'US 7')`,
    [id, reference],
  );
  await asUser(db, clientId, "SELECT public.submit_brief($1)", [id]);
  return id;
}
