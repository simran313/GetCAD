import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { completeQcTicks, connectFreshDb, givePayoutAccount } from "../helpers/db";

/**
 * Phase 3b (0042): client revision rounds (DECISIONS §8), changes as new
 * linked orders (owner answer Q5), payout obligations on close and the
 * bank-transfer export (DECISIONS §5), and the designer's 60-minute reminder.
 */

let db: Client;

const admin = generateId(); // OPS + SALES + FINANCE
const podLead = generateId();
const designer = generateId();
const otherDesigner = generateId();
const client = generateId();
const otherClient = generateId();
let pod: string;

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

const row = async (id: string) =>
  (await db.query("SELECT status, work_version, order_ref, pod_id, pod_lead_id FROM orders WHERE id=$1", [id])).rows[0];

/**
 * A ring with a real brief, walked by the client to SUBMITTED and then put at
 * `status` as the superuser: designer, QC reviewer, pod and locked INR pay set.
 */
async function order(status: string, firstLookDaysAgo = 1): Promise<string> {
  const id = generateId();
  await q(client, "SELECT public.create_order($1,'Ring','USD')", [id]);
  await q(
    client,
    `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => 'Halo ring', p_product => 'RING',
       p_metal => 'YELLOW', p_karatage => '18K', p_ring_size => 'US 6.5')`,
    [id],
  );
  await q(client, "SELECT public.transition_order($1,'SUBMITTED')", [id]);
  await db.query(
    `UPDATE orders SET status = $2, designer_id = $3, qc_reviewer_id = $4, pod_id = $5, pod_lead_id = $4,
            category = 'C', tier = 'standard', price_total = 5500, platform_commission = 5500,
            designer_payout_paise = 50000, qc_payout_paise = 90000,
            first_look_at = now() - make_interval(days => $6)
     WHERE id = $1`,
    [id, status, designer, podLead, pod, firstLookDaysAgo],
  );
  return id;
}

const ask = (id: string, note = "Make the band 0.2 mm thinner", who = client) =>
  q(who, "SELECT public.request_revision($1,$2) AS r", [id, note]);

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'QC','ACTIVE'), ($3,'DESIGNER','ACTIVE'), ($4,'DESIGNER','ACTIVE'),
       ($5,'CLIENT','ACTIVE'), ($6,'CLIENT','ACTIVE')`,
    [admin, podLead, designer, otherDesigner, client, otherClient],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email) VALUES ($1,$2,'Dana Designer','dana@x.example')`,
    [generateId(), designer],
  );
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Simran')", [podLead]);
  pod = (await db.query("INSERT INTO pods (name) VALUES ('North') RETURNING id")).rows[0].id;
  await db.query(
    "INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER')",
    [pod, podLead, designer],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describe("client revision rounds (DECISIONS §8)", () => {
  it("round 1: needs a note, opens a new version, tells the designer and the pod lead", async () => {
    const id = await order("CLIENT_PREVIEW");
    await expect(ask(id, "   ")).rejects.toThrow(/say what should change/i);

    const r = await ask(id);
    expect(r.rows[0].r).toMatchObject({ to: "REVISION_REQUESTED", round: 1 });
    expect(await row(id)).toMatchObject({ status: "REVISION_REQUESTED", work_version: 2 });

    const notes = await db.query(
      "SELECT user_id FROM notifications WHERE order_id=$1 AND kind='REVISION' ORDER BY user_id",
      [id],
    );
    expect(notes.rows.map((n) => n.user_id).sort()).toEqual([designer, podLead].sort());

    // The designer reads the note; nothing says who wrote it.
    const seen = await q(designer, "SELECT * FROM public.order_revisions($1)", [id]);
    expect(seen.rows).toHaveLength(1);
    expect(seen.rows[0]).toMatchObject({ round: 1, note: "Make the band 0.2 mm thinner", work_version: 2 });
    expect(Object.keys(seen.rows[0]).sort()).toEqual(["note", "requested_at", "round", "work_version"]);
    expect(JSON.stringify(seen.rows)).not.toContain(client);
  });

  it("the third request is refused: changes after two rounds are a new order", async () => {
    const id = await order("CLIENT_PREVIEW");
    await ask(id);
    await db.query("UPDATE orders SET status='CLIENT_PREVIEW' WHERE id=$1", [id]);
    await ask(id, "Raise the halo");
    await db.query("UPDATE orders SET status='CLIENT_PREVIEW' WHERE id=$1", [id]);

    await expect(ask(id, "One more")).rejects.toThrow(/order the change as a new order/i);
    const allow = await q(client, "SELECT public.revision_allowance($1) AS a", [id]);
    expect(allow.rows[0].a).toMatchObject({ included: 2, used: 2, open: false });
  });

  it("the window closes 14 days after first look", async () => {
    const late = await order("CLIENT_PREVIEW", 15);
    await expect(ask(late)).rejects.toThrow(/14 day window/i);
    const inTime = await order("CLIENT_PREVIEW", 13);
    await expect(ask(inTime)).resolves.toBeDefined();
  });

  it("only the order's client, only on a preview, only through request_revision", async () => {
    const id = await order("CLIENT_PREVIEW");
    await expect(ask(id, "x", otherClient)).rejects.toThrow(/not the client/i);
    await expect(ask(id, "x", designer)).rejects.toThrow(/only the client/i);
    await expect(
      q(client, "SELECT public.transition_order($1,'REVISION_REQUESTED')", [id]),
    ).rejects.toThrow(/illegal transition/i);

    const working = await order("IN_PROGRESS");
    await expect(ask(working)).rejects.toThrow(/on a preview only/i);
  });

  it("QC send-backs do not use a client round", async () => {
    const id = await order("QC_REVIEW");
    await db.query("UPDATE orders SET qc_reviewer_id = NULL WHERE id=$1", [id]);
    await q(podLead, "SELECT public.record_qc_decision($1,'REVISION','Prongs too thin')", [id]);
    await db.query("UPDATE orders SET status='QC_REVIEW' WHERE id=$1", [id]);
    await completeQcTicks(db, id, podLead);
    await q(podLead, "SELECT public.record_qc_decision($1,'PASS')", [id]);
    await db.query("UPDATE orders SET first_look_at = now() WHERE id=$1", [id]);

    const allow = await q(client, "SELECT public.revision_allowance($1) AS a", [id]);
    expect(allow.rows[0].a).toMatchObject({ used: 0, open: true });
  });
});

describe("changes as new linked orders (owner answer Q5)", () => {
  it("refused while an included round is still open", async () => {
    const id = await order("CLIENT_PREVIEW");
    await expect(
      q(client, "SELECT public.create_change_order($1,$2,'Add a hidden halo')", [id, generateId()]),
    ).rejects.toThrow(/ask for a revision instead/i);
  });

  it("after the rounds: approves the preview and opens a new order with the brief and the change", async () => {
    const parent = await order("CLIENT_PREVIEW", 20);
    const child = generateId();
    const r = await q(client, "SELECT public.create_change_order($1,$2,'Add a hidden halo') AS r", [parent, child]);
    expect(r.rows[0].r.order_id).toBe(child);

    expect((await row(parent)).status).toBe("APPROVED");
    const c = await row(child);
    expect(c).toMatchObject({ status: "SUBMITTED", pod_id: pod, pod_lead_id: podLead });
    // Minted from the copied brief's product, like any order.
    expect(c.order_ref).toMatch(/^CL\d+-RN-C-\d+$/);
    expect(r.rows[0].r.order_ref).toBe(c.order_ref);

    const spec = await db.query(
      "SELECT based_on_order_id, change_summary, product, ring_size FROM order_specs WHERE order_id=$1",
      [child],
    );
    expect(spec.rows[0]).toEqual({
      based_on_order_id: parent,
      change_summary: "Add a hidden halo",
      product: "RING",
      ring_size: "US 6.5",
    });

    // The client sees both ends of the link; the designer of the original none.
    const fromChild = await q(client, "SELECT direction, order_id FROM public.order_lineage($1)", [child]);
    expect(fromChild.rows).toEqual([{ direction: "parent", order_id: parent }]);
    const fromParent = await q(client, "SELECT direction, order_id FROM public.order_lineage($1)", [parent]);
    expect(fromParent.rows).toEqual([{ direction: "child", order_id: child }]);
    const forDesigner = await q(designer, "SELECT * FROM public.order_lineage($1)", [parent]);
    expect(forDesigner.rows).toEqual([]);

    // It is quoted at its own category and pays its own way.
    await q(admin, "SELECT public.quote_order_v2($1,'D')", [child]);
    const quoted = await db.query("SELECT status, price_total, designer_payout_paise FROM orders WHERE id=$1", [child]);
    expect(quoted.rows[0]).toMatchObject({ status: "QUOTED", price_total: 8500 });
  });

  it("works from an approved, delivered or closed order; not mid-job or for someone else", async () => {
    for (const s of ["APPROVED", "DELIVERED", "CLOSED"]) {
      const id = await order(s);
      await expect(
        q(client, "SELECT public.create_change_order($1,$2,'Longer shank')", [id, generateId()]),
      ).resolves.toBeDefined();
    }
    const working = await order("IN_PROGRESS");
    await expect(
      q(client, "SELECT public.create_change_order($1,$2,'x')", [working, generateId()]),
    ).rejects.toThrow(/once the design is approved/i);
    const done = await order("APPROVED");
    await expect(
      q(otherClient, "SELECT public.create_change_order($1,$2,'x')", [done, generateId()]),
    ).rejects.toThrow(/not the client/i);
  });
});

describe("payout obligations and the export (DECISIONS §5)", () => {
  async function close(id: string) {
    await q(admin, "SELECT public.transition_order($1,'DELIVERED')", [id]);
    await q(admin, "SELECT public.transition_order($1,'CLOSED')", [id]);
  }
  const owed = async (id: string) =>
    (
      await db.query(
        "SELECT party, payee_id, amount_paise, status FROM payout_obligations WHERE order_id=$1 ORDER BY party",
        [id],
      )
    ).rows;

  it("closing creates the designer and QC rows at the locked pay, once", async () => {
    const id = await order("APPROVED");
    expect(await owed(id)).toEqual([]);
    await close(id);
    expect(await owed(id)).toEqual([
      { party: "DESIGNER", payee_id: designer, amount_paise: 50000, status: "owed" },
      { party: "QC", payee_id: podLead, amount_paise: 90000, status: "owed" },
    ]);
    // Closing again (however it happens) adds nothing.
    await db.query("UPDATE orders SET status='DELIVERED' WHERE id=$1", [id]);
    await db.query("UPDATE orders SET status='CLOSED' WHERE id=$1", [id]);
    expect(await owed(id)).toHaveLength(2);
  });

  it("a QC send-back is not paid twice", async () => {
    const id = await order("QC_REVIEW");
    await q(podLead, "SELECT public.record_qc_decision($1,'REVISION','Seat too shallow')", [id]);
    await db.query("UPDATE orders SET status='QC_REVIEW' WHERE id=$1", [id]);
    await completeQcTicks(db, id, podLead);
    await q(podLead, "SELECT public.record_qc_decision($1,'PASS')", [id]);
    await q(client, "SELECT public.transition_order($1,'APPROVED')", [id]);
    await close(id);
    const rows = await owed(id);
    expect(rows.filter((r) => r.party === "QC")).toHaveLength(1);
    expect(rows.filter((r) => r.party === "DESIGNER")).toHaveLength(1);
  });

  it("an order quoted before Phase 2 (no INR pay) owes nothing", async () => {
    const id = await order("APPROVED");
    await db.query("UPDATE orders SET designer_payout_paise = NULL, qc_payout_paise = NULL WHERE id=$1", [id]);
    await close(id);
    expect(await owed(id)).toEqual([]);
  });

  it("each payee reads their own rows only", async () => {
    const mine = await q(designer, "SELECT id, party FROM payout_obligations ORDER BY id");
    const expected = await db.query(
      "SELECT id, party FROM payout_obligations WHERE payee_id=$1 ORDER BY id",
      [designer],
    );
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows).toEqual(expected.rows);
    const none = await q(otherDesigner, "SELECT 1 FROM payout_obligations");
    expect(none.rows).toEqual([]);
  });

  it("finance exports owed rows with bank details, reads the batch, marks it paid", async () => {
    for (const who of [designer, client, podLead]) {
      await expect(q(who, "SELECT public.export_payouts()")).rejects.toThrow(/only finance or an admin/i);
    }

    // The designer has a bank account; the pod lead's was rejected.
    await givePayoutAccount(db, designer, "VERIFIED");
    await givePayoutAccount(db, podLead, "REJECTED");

    const before = await db.query(
      "SELECT coalesce(sum(amount_paise),0)::int AS s FROM payout_obligations WHERE status='owed' AND party='DESIGNER'",
    );
    const r = await q(admin, "SELECT public.export_payouts() AS r");
    const { batch, count, total_paise } = r.rows[0].r;
    expect(batch).toMatch(/^PB-\d{8}-\d{6}-\d{3}$/);
    expect(Number(total_paise)).toBe(before.rows[0].s);
    expect(count).toBeGreaterThan(0);

    // Rejected bank details: still owed, not in the batch.
    const lead = await db.query("SELECT DISTINCT status FROM payout_obligations WHERE payee_id=$1", [podLead]);
    expect(lead.rows).toEqual([{ status: "owed" }]);

    const rows = await q(admin, "SELECT * FROM public.payout_batch_rows($1)", [batch]);
    expect(rows.rows).toHaveLength(count);
    expect(rows.rows.reduce((s, x) => s + x.amount_paise, 0)).toBe(Number(total_paise));
    expect(rows.rows[0]).toMatchObject({ account_number: "123456789012", ifsc: "HDFC0001234", party: "DESIGNER" });
    const read = await db.query(
      "SELECT is_identity_read FROM audit.audit_log WHERE action='PAYOUT_BATCH_READ' AND entity_id=$1",
      [batch],
    );
    expect(read.rows).toEqual([{ is_identity_read: true }]);
    await expect(q(designer, "SELECT * FROM public.payout_batch_rows($1)", [batch])).rejects.toThrow(/only finance/i);

    // Nothing else to export now.
    await expect(q(admin, "SELECT public.export_payouts()")).rejects.toThrow(/nothing to export/i);

    const paid = await q(admin, "SELECT public.mark_payout_batch_paid($1) AS n", [batch]);
    expect(paid.rows[0].n).toBe(count);
    const sent = await db.query(
      "SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='PAYOUT' AND summary LIKE 'Your pay of ₹500.00%'",
      [designer],
    );
    expect(sent.rows[0].n).toBe(count);
    await expect(q(admin, "SELECT public.mark_payout_batch_paid($1)", [batch])).rejects.toThrow(/no exported payouts/i);

    const list = await q(admin, "SELECT payee_name, status FROM public.payout_list() WHERE payee_id=$1", [designer]);
    expect(list.rows.every((x) => x.payee_name === "Dana Designer" && x.status === "paid")).toBe(true);
  });
});

describe("the designer's 60-minute reminder", () => {
  async function running(status: string, minutesToDue: number): Promise<string> {
    const id = await order(status);
    await db.query(
      `UPDATE orders SET sla_status='running', first_look_at=NULL, sla_started_at=now() - interval '1 hour',
              sla_due_at = now() + make_interval(mins => $2) WHERE id=$1`,
      [id, minutesToDue],
    );
    return id;
  }
  const reminders = async (id: string) =>
    (await db.query("SELECT count(*)::int AS n FROM notifications WHERE order_id=$1 AND kind='DUE_SOON'", [id])).rows[0].n;

  it("fires once, 60 minutes before the designer's due time (SLA due − 60 min QC buffer)", async () => {
    const due = await running("IN_PROGRESS", 110); // designer due in 50 min
    const early = await running("IN_PROGRESS", 200); // designer due in 140 min
    const inQc = await running("QC_REVIEW", 110);

    await db.query("SELECT public.sla_sweep()");
    await db.query("SELECT public.sla_sweep()");

    expect(await reminders(due)).toBe(1);
    expect(await reminders(early)).toBe(0);
    expect(await reminders(inQc)).toBe(0);
    const n = await db.query("SELECT user_id FROM notifications WHERE order_id=$1 AND kind='DUE_SOON'", [due]);
    expect(n.rows).toEqual([{ user_id: designer }]);
  });
});
