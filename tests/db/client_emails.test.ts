import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Client order emails (Phase 17, migration 0054).
 *
 * Every email is owed by a verified change in the database, never by a page:
 * a status the state machine reached, a clock that started, a team message.
 * What matters: the right email to the order's own client, once (idempotency
 * keys), nothing for the events that told the client already, optional kinds
 * honour the client's preferences, and no payload ever carries a designer or
 * staff identity.
 */
let db: Client;

const client = generateId();
const quiet = generateId(); // a client who turned optional emails off
const designer = generateId();
const podLead = generateId();
const EMAIL = "mehul@mj.example";

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

const rowsFor = async (order: string) =>
  (await db.query("SELECT template, recipient_email, payload, idempotency_key FROM email_outbox WHERE idempotency_key LIKE $1 ORDER BY created_at, idempotency_key", [`%${order}%`])).rows as {
    template: string;
    recipient_email: string;
    payload: Record<string, unknown>;
    idempotency_key: string;
  }[];
const templatesFor = async (order: string) => (await rowsFor(order)).map((r) => r.template);
const setStatus = (order: string, status: string) => db.query("UPDATE orders SET status=$2 WHERE id=$1", [order, status]);

async function newOrder(owner = client, source = "portal"): Promise<string> {
  const id = generateId();
  await q(owner, "SELECT public.create_order($1,'RING','USD')", [id]);
  await db.query("UPDATE orders SET source=$2 WHERE id=$1", [id, source]);
  return id;
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE'), ($2,'CLIENT','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'QC','ACTIVE')`,
    [client, quiet, designer, podLead],
  );
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran')", [podLead]);
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'Dana Designer','dana@studio.example')`,
    [generateId(), designer],
  );
  // Inserted by the harness (no signed-in user): no welcome email for these.
  await db.query(
    `INSERT INTO client_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'Mehul Jain',$3), ($4,$5,'Quiet Client','quiet@q.example')`,
    [generateId(), client, EMAIL, generateId(), quiet],
  );
  await q(quiet, "SELECT public.set_email_preferences(false,false,false)");
});

afterAll(async () => {
  await db?.end();
});

describe("order lifecycle emails", () => {
  it("each verified status sends its email, to the order's own client, with the portal fields", async () => {
    const id = await newOrder();
    await db.query("UPDATE orders SET price_total=5500 WHERE id=$1", [id]);
    for (const s of ["SUBMITTED", "QUOTED", "PAYMENT_HELD"]) await setStatus(id, s);
    await db.query("UPDATE orders SET sla_started_at=now(), sla_due_at=now() + interval '6 hours' WHERE id=$1", [id]);
    await setStatus(id, "CLIENT_PREVIEW");
    await db.query("UPDATE orders SET status='REVISION_REQUESTED', work_version=2 WHERE id=$1", [id]);
    await setStatus(id, "CLIENT_PREVIEW");
    for (const s of ["APPROVED", "DELIVERED"]) await setStatus(id, s);

    const rows = await rowsFor(id);
    expect(rows.map((r) => r.template)).toEqual([
      "ORDER_RECEIVED",
      "QUOTE_READY",
      "PAYMENT_RECEIVED",
      "ORDER_CONFIRMED",
      "FIRST_LOOK_READY",
      "REVISION_RECEIVED",
      "REVISED_DESIGN_READY",
      "DESIGN_APPROVED",
      "FILES_DELIVERED",
    ]);
    expect(new Set(rows.map((r) => r.recipient_email))).toEqual(new Set([EMAIL]));
    const quote = rows.find((r) => r.template === "QUOTE_READY")!;
    expect(quote.idempotency_key).toBe(`email:order:${id}:quoted:5500`);
    expect(quote.payload).toMatchObject({ order_id: id, name: "Mehul Jain", price: 5500, currency: "USD", title: "Ring" });
    expect(quote.payload.order_ref).toBeTruthy();
    expect(rows.find((r) => r.template === "ORDER_CONFIRMED")!.payload.due_at).toBeTruthy();
    expect(rows.find((r) => r.template === "REVISED_DESIGN_READY")!.idempotency_key).toBe(`email:order:${id}:preview:v2`);
  });

  it("never sends the same email twice for the same event", async () => {
    const id = await newOrder();
    await db.query("UPDATE orders SET price_total=5500 WHERE id=$1", [id]);
    await setStatus(id, "SUBMITTED");
    await setStatus(id, "QUOTED");
    // Back and forth to the same price: still one quote email.
    await setStatus(id, "SUBMITTED");
    await setStatus(id, "QUOTED");
    expect(await templatesFor(id)).toEqual(["ORDER_RECEIVED", "QUOTE_READY"]);
    // A new price is a new quote, and is worth telling.
    await db.query("UPDATE orders SET status='SUBMITTED' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET status='QUOTED', price_total=7000 WHERE id=$1", [id]);
    expect(await templatesFor(id)).toEqual(["ORDER_RECEIVED", "QUOTE_READY", "QUOTE_READY"]);
  });

  it("a team-placed order does not send ORDER_RECEIVED (the client was told already)", async () => {
    const id = await newOrder(client, "whatsapp");
    await setStatus(id, "SUBMITTED");
    expect(await templatesFor(id)).toEqual([]);
  });

  it("cancelling a draft emails nobody; cancelling a sent order says so", async () => {
    const draft = await newOrder();
    await setStatus(draft, "CANCELLED");
    expect(await templatesFor(draft)).toEqual([]);
    const sent = await newOrder();
    await setStatus(sent, "SUBMITTED");
    await setStatus(sent, "CANCELLED");
    expect(await templatesFor(sent)).toEqual(["ORDER_RECEIVED", "ORDER_CANCELLED"]);
  });

  it("a missed first look sends ORDER_DELAYED once", async () => {
    const id = await newOrder();
    await db.query("UPDATE orders SET sla_status='running' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET sla_status='breached' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET sla_status='breached_credited' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET sla_status='breached' WHERE id=$1", [id]);
    expect(await templatesFor(id)).toEqual(["ORDER_DELAYED"]);
  });

  it("problems, refunds and late credits reach the client", async () => {
    const id = await newOrder();
    await setStatus(id, "DISPUTED");
    await setStatus(id, "REFUNDED");
    const credit = (
      await db.query(
        "INSERT INTO client_credits (client_id, order_id, kind, amount_cents, currency) VALUES ($1,$2,'sla_credit',5500,'USD') RETURNING id",
        [client, id],
      )
    ).rows[0].id;
    await db.query("UPDATE client_credits SET status='apply_next', decided_at=now() WHERE id=$1", [credit]);
    expect(await templatesFor(id)).toEqual(["PROBLEM_RECEIVED", "ORDER_REFUNDED"]);
    const credited = (await db.query("SELECT template, payload FROM email_outbox WHERE idempotency_key=$1", [`email:credit:${credit}:apply_next`])).rows;
    expect(credited).toHaveLength(1);
    expect(credited[0].template).toBe("CREDIT_DECIDED");
    expect(credited[0].payload).toMatchObject({ order_id: id, decision: "apply_next", amount: 5500, credit_currency: "USD" });
  });

  it("an order whose client has no profile yet enqueues nothing (nowhere to send)", async () => {
    const bare = generateId();
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE')", [bare]);
    const id = await newOrder(bare);
    await setStatus(id, "SUBMITTED");
    expect(await templatesFor(id)).toEqual([]);
  });
});

describe("team messages", () => {
  let order: string;
  let thread: string;
  let internal: string;
  beforeAll(async () => {
    order = await newOrder();
    await putOrderInPod(db, order, podLead);
    await db.query("UPDATE orders SET designer_id=$2 WHERE id=$1", [order, designer]);
    const t = (await db.query("SELECT id, kind FROM message_threads WHERE order_id=$1", [order])).rows;
    thread = t.find((r) => r.kind === "client_team").id;
    internal = t.find((r) => r.kind === "internal").id;
  });
  const send = (who: string, th: string, body: string) => q(who, "SELECT public.send_chat_message($1,$2,$3)", [th, body, `r${generateId()}`]);

  it("a team reply emails the client once per half hour, with a short excerpt", async () => {
    await send(podLead, thread, "Your first look is ready.\n\nTake a look when you can.");
    await send(podLead, thread, "One more thing about the shank.");
    const rows = (await rowsFor(order)).filter((r) => r.template === "NEW_MESSAGE");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload.excerpt).toBe("Your first look is ready. Take a look when you can.");
    expect(rows[0]!.idempotency_key).toMatch(new RegExp(`^email:message:${order}:\\d+$`));
  });

  it("the client's own messages and the designer thread email nobody", async () => {
    const before = (await rowsFor(order)).length;
    await send(client, thread, "Thanks!");
    await send(designer, internal, "Uploading v1 now.");
    await send(podLead, internal, "Looks good.");
    expect((await rowsFor(order)).length).toBe(before);
  });

  it("a client who turned message emails off gets none", async () => {
    const id = await newOrder(quiet);
    await putOrderInPod(db, id, podLead);
    const th = (await db.query("SELECT id FROM message_threads WHERE order_id=$1 AND kind='client_team'", [id])).rows[0].id;
    await send(podLead, th, "Hello");
    expect(await templatesFor(id)).toEqual([]);
  });
});

describe("reminders (enqueue_email_reminders)", () => {
  const age = (key: string, interval: string) =>
    db.query(`UPDATE email_outbox SET created_at = now() - $2::interval WHERE idempotency_key=$1`, [key, interval]);
  const run = () => db.query("SELECT public.enqueue_email_reminders()");

  it("follows up an unpaid quote after a day, a waiting design after two, and asks for feedback after three", async () => {
    const quoted = await newOrder();
    await db.query("UPDATE orders SET price_total=5500, status='QUOTED' WHERE id=$1", [quoted]);
    const preview = await newOrder();
    await setStatus(preview, "CLIENT_PREVIEW");
    const done = await newOrder();
    await setStatus(done, "DELIVERED");

    await run();
    expect([...(await templatesFor(quoted)), ...(await templatesFor(preview)), ...(await templatesFor(done))]).toEqual([
      "QUOTE_READY",
      "FIRST_LOOK_READY",
      "FILES_DELIVERED",
    ]);

    await age(`email:order:${quoted}:quoted:5500`, "25 hours");
    await age(`email:order:${preview}:preview:v1`, "49 hours");
    await age(`email:order:${done}:delivered`, "73 hours");
    await run();
    await run(); // a second sweep owes nothing new
    expect(await templatesFor(quoted)).toEqual(["QUOTE_READY", "QUOTE_REMINDER"]);
    expect(await templatesFor(preview)).toEqual(["FIRST_LOOK_READY", "PREVIEW_REMINDER"]);
    expect(await templatesFor(done)).toEqual(["FILES_DELIVERED", "FEEDBACK_REQUEST"]);
  });

  it("no reminder once the client acted, or after two weeks, or when reminders are off", async () => {
    const paid = await newOrder();
    await db.query("UPDATE orders SET price_total=5500, status='QUOTED' WHERE id=$1", [paid]);
    await age(`email:order:${paid}:quoted:5500`, "25 hours");
    await setStatus(paid, "PAYMENT_HELD");
    const stale = await newOrder();
    await db.query("UPDATE orders SET price_total=5500, status='QUOTED' WHERE id=$1", [stale]);
    await age(`email:order:${stale}:quoted:5500`, "15 days");
    const off = await newOrder(quiet);
    await db.query("UPDATE orders SET price_total=5500, status='QUOTED' WHERE id=$1", [off]);
    await age(`email:order:${off}:quoted:5500`, "25 hours");
    await run();
    expect(await templatesFor(paid)).toEqual(["QUOTE_READY", "PAYMENT_RECEIVED"]);
    expect(await templatesFor(stale)).toEqual(["QUOTE_READY"]);
    expect(await templatesFor(off)).toEqual(["QUOTE_READY"]);
  });

  it("only the email sweep (service role) may run it", async () => {
    await expect(q(client, "SELECT public.enqueue_email_reminders()")).rejects.toThrow(/permission denied/i);
  });
});

describe("welcome email", () => {
  it("is sent when a client creates their own account, once", async () => {
    const me = generateId();
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE')", [me]);
    await q(me, "SELECT public.save_client_profile('Asha Gems','Asha Rao','asha@ag.example')");
    await q(me, "SELECT public.save_client_profile('Asha Gems','Asha Rao','asha@ag.example')");
    const { rows } = await db.query("SELECT template, recipient_email, payload FROM email_outbox WHERE idempotency_key=$1", [`email:welcome:${me}`]);
    expect(rows).toEqual([{ template: "WELCOME", recipient_email: "asha@ag.example", payload: { name: "Asha Rao" } }]);
  });

  it("is not sent for a client the team registered (they get ORDER_PLACED_FOR_YOU)", async () => {
    const theirs = `user_${generateId()}`;
    await q(podLead, "SELECT public.register_client($1,'Shree Ganesh','Amit','amit@sg.example')", [theirs]);
    const { rows } = await db.query("SELECT 1 FROM email_outbox WHERE idempotency_key=$1", [`email:welcome:${theirs}`]);
    expect(rows).toEqual([]);
  });
});

describe("anonymity and preferences", () => {
  it("no client email carries a designer or staff identity", async () => {
    const { rows } = await db.query(
      "SELECT payload::text AS p, recipient_email FROM email_outbox WHERE idempotency_key LIKE 'email:order:%' OR idempotency_key LIKE 'email:message:%' OR idempotency_key LIKE 'email:credit:%'",
    );
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.p).not.toMatch(/Dana|dana@studio|Simran|designer_id|qc_reviewer|pod/i);
      expect(r.p).not.toContain(designer);
      expect(r.p).not.toContain(podLead);
      expect(r.recipient_email).not.toBe("dana@studio.example");
    }
  });

  it("a client reads and changes only their own preferences; defaults are on, marketing off", async () => {
    const fresh = generateId();
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'CLIENT','ACTIVE')", [fresh]);
    expect((await q(fresh, "SELECT public.my_email_preferences() AS p")).rows[0].p).toEqual({ messages: true, reminders: true, marketing: false });
    await q(fresh, "SELECT public.set_email_preferences(false,true,true)");
    expect((await q(fresh, "SELECT public.my_email_preferences() AS p")).rows[0].p).toEqual({ messages: false, reminders: true, marketing: true });
    expect((await q(quiet, "SELECT public.my_email_preferences() AS p")).rows[0].p).toEqual({ messages: false, reminders: false, marketing: false });
    await expect(q(fresh, "SELECT * FROM email_preferences")).rejects.toThrow(/permission denied/i);
    await expect(q(fresh, "UPDATE email_preferences SET messages=true")).rejects.toThrow(/permission denied/i);
  });
});
