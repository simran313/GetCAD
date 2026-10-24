import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 4b (0045): files in the order's conversations, readable exactly where
 * the thread is; only cleanable formats in the designer thread; and the
 * activity stamp the order page polls.
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

const q = (sub: string, sql: string, params: unknown[] = []) => asUser(sub, () => db.query(sql, params));

const attach = (who: string, thread: string, type = "image/png", ext = "png", note: string | null = null) =>
  q(who, "SELECT public.post_thread_file($1,$2,$3,10,$4,$5) AS r", [
    thread,
    `${order}/threads/${generateId()}.${ext}`,
    type,
    ext,
    note,
  ]);

const stamp = async (who: string) =>
  Number((await q(who, "SELECT public.order_activity_stamp($1) AS s", [order])).rows[0].s);

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
  await db.query("UPDATE orders SET designer_id=$2, status='IN_PROGRESS' WHERE id=$1", [order, designer]);
  const t = await db.query("SELECT id, kind FROM message_threads WHERE order_id=$1", [order]);
  clientThread = t.rows.find((r) => r.kind === "client_team").id;
  internalThread = t.rows.find((r) => r.kind === "internal").id;
});

afterAll(async () => {
  if (db) await db.end();
});

describe("files in the conversations", () => {
  it("a client attaches a PDF for the team; the designer never sees it", async () => {
    const r = await attach(client, clientThread, "application/pdf", "pdf", "Our old drawing");
    expect(r.rows[0].r.file_name).toBe("file_1.pdf");

    const forLead = await q(podLead, "SELECT file_name, thread_id FROM public.thread_attachments($1)", [order]);
    expect(forLead.rows).toEqual([{ file_name: "file_1.pdf", thread_id: clientThread }]);
    const forDesigner = await q(designer, "SELECT * FROM public.thread_attachments($1)", [order]);
    expect(forDesigner.rows).toEqual([]);
    const dl = await q(designer, "SELECT * FROM public.thread_file_for_download($1)", [r.rows[0].r.file_id]);
    expect(dl.rows).toEqual([]);

    // The message carries the note, and the pod lead is told.
    const msgs = await q(podLead, "SELECT body FROM public.order_messages($1) WHERE thread_kind='client_team'", [order]);
    expect(msgs.rows.map((m) => m.body)).toContain("Our old drawing");
  });

  it("the pod lead sends the designer a cleanable file; numbering is per thread", async () => {
    const r = await attach(podLead, internalThread, "model/x-3dm", "3dm");
    expect(r.rows[0].r.file_name).toBe("file_1.3dm");
    const forDesigner = await q(designer, "SELECT file_name FROM public.thread_attachments($1)", [order]);
    expect(forDesigner.rows).toEqual([{ file_name: "file_1.3dm" }]);
    const dl = await q(designer, "SELECT object_key FROM public.thread_file_for_download($1)", [r.rows[0].r.file_id]);
    expect(dl.rows).toHaveLength(1);
    // The client cannot read the designer thread's files.
    const forClient = await q(client, "SELECT file_name FROM public.thread_attachments($1)", [order]);
    expect(forClient.rows.map((x) => x.file_name)).toEqual(["file_1.pdf"]);
  });

  it("the designer thread refuses formats the gate cannot clean", async () => {
    await expect(attach(podLead, internalThread, "application/pdf", "pdf")).rejects.toThrow(/PNG, JPEG, STEP, STL or 3DM/i);
    await expect(attach(designer, internalThread, "application/zip", "zip")).rejects.toThrow(/PNG, JPEG, STEP, STL or 3DM/i);
  });

  it("the posting rules of the thread apply", async () => {
    await expect(attach(designer, clientThread)).rejects.toThrow(/thread not found|designers cannot post/i);
    await expect(attach(outsider, internalThread)).rejects.toThrow(/thread not found/i);
    await expect(attach(client, internalThread)).rejects.toThrow(/thread not found/i);
    await expect(attach(podLead, clientThread, "image/png", "../x")).rejects.toThrow(/extension/i);
  });

  it("no direct table access", async () => {
    await expect(q(podLead, "SELECT 1 FROM thread_files")).rejects.toThrow(/permission denied/i);
  });
});

describe("the activity stamp", () => {
  it("moves for what the viewer can see, not for the other thread", async () => {
    const d0 = await stamp(designer);
    const c0 = await stamp(client);

    await q(client, "SELECT public.post_thread_message($1,'Any update?')", [clientThread]);
    expect(await stamp(client)).toBeGreaterThan(c0);
    expect(await stamp(designer)).toBe(d0);

    await q(podLead, "SELECT public.post_thread_message($1,'Prongs 0.8 please')", [internalThread]);
    expect(await stamp(designer)).toBeGreaterThan(d0);
  });

  it("is null for someone not on the order", async () => {
    const r = await q(outsider, "SELECT public.order_activity_stamp($1) AS s", [order]);
    expect(r.rows[0].s).toBeNull();
  });
});
