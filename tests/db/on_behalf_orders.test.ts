import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * Phase 4a (0043): orders the team places for a client from email, WhatsApp
 * or phone; client accounts the team opens; screenshots for the client and
 * the team only; the team writing the brief of those orders.
 */

let db: Client;

const admin = generateId(); // OPS + SALES + FINANCE
const podLead = generateId();
const otherLead = generateId();
const designer = generateId();
const client = generateId();
const newClient = `user_${generateId()}`;
let pod: string;
let otherPod: string;

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

const place = (who: string, id: string, over: { client?: string; source?: string; pod?: string | null } = {}) =>
  q(
    who,
    "SELECT public.create_order_on_behalf($1,$2,$3::order_source,'RING','cad',now() - interval '1 hour','Ring as in the photo, size 7',$4) AS r",
    [id, over.client ?? client, over.source ?? "whatsapp", over.pod === undefined ? null : over.pod],
  );

const shot = (who: string, id: string) =>
  q(who, "SELECT public.add_order_screenshot($1,$2,'image/png',1234)", [id, `${id}/shots/${generateId()}.png`]);

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'QC','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'DESIGNER','ACTIVE'), ($5,'CLIENT','ACTIVE')`,
    [admin, podLead, otherLead, designer, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran'), ($2,'Fazil')", [podLead, admin]);
  await db.query(
    `INSERT INTO client_profiles (id, user_id, legal_name, email, phone, business_name)
     VALUES ($1,$2,'Mehul Jain','mehul@mj.example','+919800000000','Mehta Jewels')`,
    [generateId(), client],
  );
  pod = (await db.query("INSERT INTO pods (name) VALUES ('Pod 1') RETURNING id")).rows[0].id;
  otherPod = (await db.query("INSERT INTO pods (name) VALUES ('Pod 2') RETURNING id")).rows[0].id;
  await db.query(
    `INSERT INTO pod_members (pod_id, user_id, member_role) VALUES
       ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER'), ($4,$5,'POD_LEAD')`,
    [pod, podLead, designer, otherPod, otherLead],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describe("placing an order for a client", () => {
  it("a pod lead places it into their pod; the note reaches the client thread", async () => {
    const id = generateId();
    const r = await place(podLead, id);
    expect(r.rows[0].r.pod_id).toBe(pod);
    const o = await db.query(
      "SELECT status, source, intake_mode, created_on_behalf_by, pod_lead_id, received_at IS NOT NULL AS has_received FROM orders WHERE id=$1",
      [id],
    );
    expect(o.rows[0]).toEqual({
      status: "DRAFT",
      source: "whatsapp",
      intake_mode: "quick",
      created_on_behalf_by: podLead,
      pod_lead_id: podLead,
      has_received: true,
    });
    const seen = await q(client, "SELECT thread_kind, sender_alias, body FROM public.order_messages($1)", [id]);
    expect(seen.rows).toEqual([{ thread_kind: "client_team", sender_alias: "Team · Simran", body: "Ring as in the photo, size 7" }]);
  });

  it("refuses designers, clients, the portal as a source, and another lead's pod", async () => {
    await expect(place(designer, generateId())).rejects.toThrow(/only an admin or a pod lead/i);
    await expect(place(client, generateId())).rejects.toThrow(/only an admin or a pod lead/i);
    await expect(place(podLead, generateId(), { source: "portal" })).rejects.toThrow(/email, WhatsApp or phone/i);
    await expect(place(podLead, generateId(), { pod: otherPod })).rejects.toThrow(/a pod you lead/i);
    await expect(place(podLead, generateId(), { client: designer })).rejects.toThrow(/client not found/i);
  });

  it("an admin may place it with no pod yet", async () => {
    const id = generateId();
    await place(admin, id, { source: "email" });
    const o = await db.query("SELECT pod_id, source FROM orders WHERE id=$1", [id]);
    expect(o.rows[0]).toEqual({ pod_id: null, source: "email" });
  });

  it("cannot be submitted without a screenshot; once submitted it has a reference and the client is told", async () => {
    const id = generateId();
    await place(podLead, id);
    await expect(q(podLead, "SELECT public.submit_order_on_behalf($1)", [id])).rejects.toThrow(/at least one screenshot/i);

    await shot(podLead, id);
    const r = await q(podLead, "SELECT public.submit_order_on_behalf($1) AS r", [id]);
    expect(r.rows[0].r.order_ref).toMatch(/^MJ\d+-RN-C-\d+$/);
    expect((await db.query("SELECT status FROM orders WHERE id=$1", [id])).rows[0].status).toBe("SUBMITTED");

    const note = await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='PLACED' AND order_id=$2", [client, id]);
    expect(note.rows).toHaveLength(1);
    const mail = await db.query(
      "SELECT template, recipient_email, payload FROM email_outbox WHERE idempotency_key = $1",
      [`email:order_placed:${id}`],
    );
    expect(mail.rows[0]).toMatchObject({
      template: "ORDER_PLACED_FOR_YOU",
      recipient_email: "mehul@mj.example",
      payload: { order_ref: r.rows[0].r.order_ref, order_id: id, channel: "whatsapp" },
    });

    await expect(q(podLead, "SELECT public.submit_order_on_behalf($1)", [id])).rejects.toThrow(/already submitted/i);
  });

  it("with notify off, nothing is sent", async () => {
    const id = generateId();
    await place(podLead, id);
    await shot(podLead, id);
    await q(podLead, "SELECT public.submit_order_on_behalf($1,false)", [id]);
    const mail = await db.query("SELECT 1 FROM email_outbox WHERE idempotency_key = $1", [`email:order_placed:${id}`]);
    expect(mail.rows).toEqual([]);
  });

  it("another pod's lead cannot touch it", async () => {
    const id = generateId();
    await place(podLead, id);
    await expect(shot(otherLead, id)).rejects.toThrow(/not found or not visible/i);
    await expect(q(otherLead, "SELECT public.submit_order_on_behalf($1)", [id])).rejects.toThrow(/not found or not visible/i);
  });
});

describe("screenshots: the client and the team, never a designer", () => {
  it("client, admin and pod lead read them; the assigned designer does not", async () => {
    const id = generateId();
    await place(podLead, id);
    await shot(podLead, id);
    await shot(podLead, id);
    await db.query("UPDATE orders SET designer_id=$2, status='IN_PROGRESS' WHERE id=$1", [id, designer]);

    for (const who of [client, admin, podLead]) {
      const r = await q(who, "SELECT position FROM order_screenshots WHERE order_id=$1 ORDER BY position", [id]);
      expect(r.rows.map((x) => x.position), who).toEqual([1, 2]);
    }
    const d = await q(designer, "SELECT 1 FROM order_screenshots WHERE order_id=$1", [id]);
    expect(d.rows).toEqual([]);
    await expect(q(designer, "SELECT * FROM public.order_client_contact($1)", [id])).rejects.toThrow(/not visible/i);
  });

  it("portal orders take no screenshots", async () => {
    const id = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [id]);
    await db.query("UPDATE orders SET pod_id=$2, pod_lead_id=$3 WHERE id=$1", [id, pod, podLead]);
    await expect(shot(podLead, id)).rejects.toThrow(/orders the team placed/i);
  });
});

describe("the team writes the brief of orders it placed", () => {
  const brief = (who: string, id: string) =>
    q(
      who,
      `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'WhatsApp ring', p_product => 'RING',
         p_metal => 'YELLOW', p_ring_size => 'US 7')`,
      [id],
    );

  it("pod lead and admin may; a designer, another lead, and the team on portal orders may not", async () => {
    const id = generateId();
    await place(podLead, id);
    await brief(podLead, id);
    await brief(admin, id);
    await q(podLead, "SELECT public.add_reference_image($1,$2,'image/png',99)", [id, `${id}/refs/${generateId()}.png`]);
    const spec = await db.query("SELECT ring_size FROM order_specs WHERE order_id=$1", [id]);
    expect(spec.rows[0].ring_size).toBe("US 7");

    await expect(brief(designer, id)).rejects.toThrow(/only the client/i);
    await expect(brief(otherLead, id)).rejects.toThrow(/only the client/i);

    const portal = generateId();
    await q(client, "SELECT public.create_order($1,'RING','USD')", [portal]);
    await db.query("UPDATE orders SET pod_id=$2, pod_lead_id=$3 WHERE id=$1", [portal, pod, podLead]);
    await expect(brief(podLead, portal)).rejects.toThrow(/only the client/i);
  });

  it("the quote freeze still applies to the team", async () => {
    const id = generateId();
    await place(podLead, id);
    await db.query("UPDATE orders SET status='QUOTED' WHERE id=$1", [id]);
    await expect(brief(podLead, id)).rejects.toThrow(/fixed once the order has been quoted/i);
  });
});

describe("clients the team opens and finds", () => {
  it("opens a new client with a code; the same account again changes nothing", async () => {
    const r = await q(
      podLead,
      "SELECT public.register_client($1,'Shree Ganesh Jewellers','Amit','amit@sg.example','+919811111111') AS r",
      [newClient],
    );
    expect(r.rows[0].r).toMatchObject({ user_id: newClient, new: true });
    expect(r.rows[0].r.client_code).toMatch(/^SG\d+$/);

    const again = await q(admin, "SELECT public.register_client($1,'Other Name','X','x@x.example') AS r", [newClient]);
    expect(again.rows[0].r).toMatchObject({ new: false, client_code: r.rows[0].r.client_code });
    const p = await db.query("SELECT business_name FROM client_profiles WHERE user_id=$1", [newClient]);
    expect(p.rows[0].business_name).toBe("Shree Ganesh Jewellers");

    // And an order can be placed for them straight away.
    await place(podLead, generateId(), { client: newClient });
  });

  it("refuses non-team callers, bad ids and staff accounts", async () => {
    await expect(
      q(designer, "SELECT public.register_client($1,'B','C','c@c.example')", [`user_${generateId()}`]),
    ).rejects.toThrow(/only an admin or a pod lead/i);
    await expect(q(admin, "SELECT public.register_client('nope','B','C','c@c.example')")).rejects.toThrow(/not a sign-in account/i);
    const staff = `user_${generateId()}`;
    await db.query("INSERT INTO users (id, role, status) VALUES ($1,'OPS','ACTIVE')", [staff]);
    await expect(q(admin, "SELECT public.register_client($1,'B','C','c@c.example')", [staff])).rejects.toThrow(
      /team or designer account/i,
    );
  });

  it("find_clients: team only, audited as an identity read", async () => {
    const r = await q(podLead, "SELECT user_id, business_name, email FROM public.find_clients('mehta')");
    expect(r.rows).toEqual([{ user_id: client, business_name: "Mehta Jewels", email: "mehul@mj.example" }]);
    const audit = await db.query(
      "SELECT is_identity_read FROM audit.audit_log WHERE action='CLIENT_LOOKUP' AND actor_id=$1",
      [podLead],
    );
    expect(audit.rows.every((a) => a.is_identity_read)).toBe(true);
    await expect(q(designer, "SELECT * FROM public.find_clients('mehta')")).rejects.toThrow(/only an admin or a pod lead/i);
    await expect(q(client, "SELECT * FROM public.find_clients('mehta')")).rejects.toThrow(/only an admin or a pod lead/i);
  });
});
