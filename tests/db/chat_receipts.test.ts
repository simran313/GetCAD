import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Chat receipts (0053): a send is saved once however often it is repeated;
 * the viewer's own reference comes back only on their own messages; reads
 * are recorded per side and reported to the other side as one time per
 * thread, never a name; a designer never learns anything about the client's
 * thread.
 */

let db: Client;

const client = generateId();
const designer = generateId();
const podLead = generateId();
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

const send = async (who: string, thread: string, body: string, ref: string) =>
  (await q(who, "SELECT public.send_chat_message($1,$2,$3) AS r", [thread, body, ref])).rows[0].r as { message_id: string; created_at: string; repeat: boolean };
const readState = async (who: string) =>
  Object.fromEntries(
    (await q(who, "SELECT thread_id, others_read_at FROM public.thread_read_state($1)", [order])).rows.map((r) => [r.thread_id, r.others_read_at]),
  ) as Record<string, Date | null>;
const stamp = async (who: string) => Number((await q(who, "SELECT public.order_activity_stamp($1) AS s", [order])).rows[0].s);
const ref = () => `r${generateId()}`;

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE'), ($2,'DESIGNER','ACTIVE'), ($3,'QC','ACTIVE')`,
    [client, designer, podLead],
  );
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran')", [podLead]);
  order = generateId();
  await q(client, "SELECT public.create_order($1,'RING','USD')", [order]);
  await putOrderInPod(db, order, podLead);
  await db.query("UPDATE orders SET designer_id = $2 WHERE id = $1", [order, designer]);
  const t = await db.query("SELECT id, kind FROM message_threads WHERE order_id=$1", [order]);
  clientThread = t.rows.find((r) => r.kind === "client_team").id;
  internalThread = t.rows.find((r) => r.kind === "internal").id;
});

afterAll(async () => {
  await db?.end();
});

describe("sending once (0053)", () => {
  it("a repeated send returns the first message instead of posting again", async () => {
    const r = ref();
    const first = await send(client, clientThread, "Is the shank 1.8 mm?", r);
    const again = await send(client, clientThread, "Is the shank 1.8 mm?", r);
    expect(first.repeat).toBe(false);
    expect(again).toEqual({ ...first, repeat: true });
    const n = await db.query("SELECT count(*)::int AS n FROM messages WHERE thread_id=$1 AND body='Is the shank 1.8 mm?'", [clientThread]);
    expect(n.rows[0].n).toBe(1);
  });

  it("refuses a missing or malformed reference, and keeps the posting rules", async () => {
    await expect(send(client, clientThread, "x", "")).rejects.toThrow(/reference/i);
    await expect(send(client, clientThread, "x", "has spaces in it")).rejects.toThrow(/reference/i);
    await expect(send(designer, clientThread, "hello client", ref())).rejects.toThrow(/thread not found|designers cannot post/i);
  });

  it("the reference comes back on the sender's own messages only", async () => {
    const r = ref();
    await send(client, clientThread, "Thanks!", r);
    const mine = await q(client, "SELECT client_ref FROM public.order_messages($1) WHERE body='Thanks!'", [order]);
    expect(mine.rows[0].client_ref).toBe(r);
    const theirs = await q(podLead, "SELECT client_ref FROM public.order_messages($1) WHERE body='Thanks!'", [order]);
    expect(theirs.rows[0].client_ref).toBeNull();
  });
});

describe("read receipts (0053)", () => {
  it("each side learns when the other side read, as one time per thread", async () => {
    // The client has written; the team has not read yet.
    expect((await readState(client))[clientThread]).toBeNull();
    const before = await stamp(client);

    await q(podLead, "SELECT public.mark_thread_read($1)", [clientThread]);
    const seen = (await readState(client))[clientThread];
    expect(seen).toBeInstanceOf(Date);
    // The client's open chat notices without Realtime: the stamp moved.
    expect(await stamp(client)).toBeGreaterThan(before);

    // The team does not count its own read as the client's.
    expect((await readState(podLead))[clientThread]).toBeNull();
    await send(podLead, clientThread, "Yes, 1.8 mm.", ref());
    await q(client, "SELECT public.mark_thread_read($1)", [clientThread]);
    expect((await readState(podLead))[clientThread]).toBeInstanceOf(Date);
  });

  it("nothing new means no write", async () => {
    const r1 = (await q(client, "SELECT public.mark_thread_read($1) AS t", [clientThread])).rows[0].t;
    const r2 = (await q(client, "SELECT public.mark_thread_read($1) AS t", [clientThread])).rows[0].t;
    expect(r2).toEqual(r1);
  });

  it("a designer never learns anything about the client's thread", async () => {
    const state = await readState(designer);
    expect(Object.keys(state)).toEqual([internalThread]);
    await expect(q(designer, "SELECT public.mark_thread_read($1)", [clientThread])).rejects.toThrow(/thread not found/i);
  });

  it("the designer thread works the same way between the designer and the team", async () => {
    await send(podLead, internalThread, "Prongs 0.8 please", ref());
    await q(designer, "SELECT public.mark_thread_read($1)", [internalThread]);
    expect((await readState(podLead))[internalThread]).toBeInstanceOf(Date);
    expect((await readState(designer))[internalThread]).toBeNull();
  });

  it("reads are not readable or writable directly", async () => {
    await expect(q(client, "SELECT * FROM thread_reads")).rejects.toThrow(/permission denied/i);
    await expect(q(client, "INSERT INTO thread_reads VALUES ($1,$2,'CLIENT',now())", [clientThread, client])).rejects.toThrow(/permission denied/i);
  });
});
