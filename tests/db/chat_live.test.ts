import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Live chat (0052). A message or a file in a thread sends a signal on that
 * thread's private channel; the signal carries nothing; only people who may
 * read the thread may hear it; a failed signal never loses the message.
 *
 * The test database has no Supabase Realtime, so a stand-in `realtime` schema
 * records what would have been sent, and a stand-in realtime.messages table
 * runs the real receive policy from the migration.
 */

let db: Client;

const client = generateId();
const designer = generateId();
const podLead = generateId();
const outsider = generateId();
let order: string;
let clientThread: string;
let internalThread: string;

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

const sent = async () => (await db.query("SELECT payload, event, topic, private FROM realtime.sent ORDER BY n")).rows;
const canHear = async (who: string, topic: string | null) =>
  (await q(who, "SELECT app.can_receive_thread_signal($1) AS ok", [topic])).rows[0].ok as boolean;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'CLIENT','ACTIVE'), ($2,'DESIGNER','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'DESIGNER','ACTIVE')`,
    [client, designer, podLead, outsider],
  );
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran')", [podLead]);
  order = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [order]);
  await putOrderInPod(db, order, podLead);
  await db.query("UPDATE orders SET designer_id = $2 WHERE id = $1", [order, designer]);
  const t = await db.query("SELECT id, kind FROM message_threads WHERE order_id=$1", [order]);
  clientThread = t.rows.find((r) => r.kind === "client_team").id;
  internalThread = t.rows.find((r) => r.kind === "internal").id;

  // Stand-in for Supabase's realtime.send: remember each call.
  await db.query(`
    DROP SCHEMA IF EXISTS realtime CASCADE;
    CREATE SCHEMA realtime;
    CREATE TABLE realtime.sent (n serial, payload jsonb, event text, topic text, private boolean);
    CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) RETURNS void
      LANGUAGE sql AS $$ INSERT INTO realtime.sent (payload, event, topic, private) VALUES (payload, event, topic, private) $$;
  `);
});

afterAll(async () => {
  // The stand-in must not outlive this file: the next suite's fresh schema
  // would otherwise find a realtime.send to call.
  await db?.query("DROP SCHEMA IF EXISTS realtime CASCADE");
  await db?.end();
});

describe("live chat signals (0052)", () => {
  it("a message sends an empty signal on its thread's private channel", async () => {
    await q(client, "SELECT public.post_thread_message($1,'Any update?')", [clientThread]);
    await q(podLead, "SELECT public.post_thread_message($1,'Prongs 0.8 please')", [internalThread]);
    expect(await sent()).toEqual([
      { payload: {}, event: "changed", topic: `thread:${clientThread}`, private: true },
      { payload: {}, event: "changed", topic: `thread:${internalThread}`, private: true },
    ]);
  });

  it("a file in the thread sends one too", async () => {
    await db.query("TRUNCATE realtime.sent");
    await q(client, "SELECT public.post_thread_file($1,$2,'image/png',10,'png',NULL)", [clientThread, `${order}/threads/${generateId()}.png`]);
    expect((await sent()).map((s) => s.topic)).toContain(`thread:${clientThread}`);
  });

  it("only people who may read the thread may hear it; a designer never hears the client's", async () => {
    expect(await canHear(client, `thread:${clientThread}`)).toBe(true);
    expect(await canHear(client, `thread:${internalThread}`)).toBe(false);
    expect(await canHear(designer, `thread:${clientThread}`)).toBe(false);
    expect(await canHear(designer, `thread:${internalThread}`)).toBe(true);
    expect(await canHear(podLead, `thread:${clientThread}`)).toBe(true);
    expect(await canHear(podLead, `thread:${internalThread}`)).toBe(true);
    expect(await canHear(outsider, `thread:${clientThread}`)).toBe(false);
    expect(await canHear(outsider, `thread:${internalThread}`)).toBe(false);
    for (const topic of [null, "", `order:${order}`, "thread:", "thread:nope"]) expect(await canHear(client, topic)).toBe(false);
  });

  it("a failed signal never loses the message", async () => {
    await db.query(`
      CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) RETURNS void
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'realtime is down'; END $$;
    `);
    await q(client, "SELECT public.post_thread_message($1,'Still there?')", [clientThread]);
    const msgs = await q(client, "SELECT body FROM public.order_messages($1) WHERE thread_kind='client_team'", [order]);
    expect(msgs.rows.map((r) => r.body)).toContain("Still there?");
  });

  it("without Realtime at all, messages are saved and nothing is sent", async () => {
    await db.query("DROP FUNCTION realtime.send(jsonb, text, text, boolean)");
    await q(client, "SELECT public.post_thread_message($1,'No realtime here')", [clientThread]);
    const msgs = await q(client, "SELECT body FROM public.order_messages($1) WHERE thread_kind='client_team'", [order]);
    expect(msgs.rows.map((r) => r.body)).toContain("No realtime here");
  });

  it("the receive policy on realtime.messages lets each person join only their threads", async () => {
    // Supabase's table and topic(), reduced to what the policy reads.
    await db.query(`
      CREATE TABLE realtime.messages (id serial, topic text, extension text);
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('realtime.topic', true) $$;
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA realtime TO authenticated;
      GRANT SELECT ON realtime.messages TO authenticated;
      GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated;
      INSERT INTO realtime.messages (topic, extension) VALUES ('x', 'broadcast'), ('x', 'presence');
    `);
    // Re-run the migration now that the table exists: it adds the policy.
    await db.query(readFileSync(join(process.cwd(), "db/migrations/0052_chat_live.sql"), "utf8"));
    const joins = async (who: string, thread: string) => {
      await db.query("SELECT set_config('realtime.topic', $1, false)", [`thread:${thread}`]);
      return Number((await q(who, "SELECT count(*) AS n FROM realtime.messages")).rows[0].n);
    };
    expect(await joins(client, clientThread)).toBe(1); // broadcast only, never presence
    expect(await joins(client, internalThread)).toBe(0);
    expect(await joins(designer, clientThread)).toBe(0);
    expect(await joins(designer, internalThread)).toBe(1);
    expect(await joins(outsider, clientThread)).toBe(0);
    await expect(q(client, "INSERT INTO realtime.messages (topic, extension) VALUES ('thread:x','broadcast')")).rejects.toThrow(/permission denied|row-level security/i);
  });
});
