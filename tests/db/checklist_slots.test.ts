import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb } from "../helpers/db";

/**
 * Phase 3a (0041): assignment with capacity, the checklist, the upload slots
 * and the gates between them (Spec §7–§9, §12.4–5). The checklist is 0059's
 * two-stage QC: the designer check (9 lines) and the QC manager check (5),
 * each line Pass or Fail with a finding and a remark.
 */

let db: Client;

const admin = generateId();
const podLead = generateId();
const otherLead = generateId();
const designer = generateId();
const busyDesigner = generateId();
const outsider = generateId(); // a designer in another pod
const client = generateId();
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

async function makeAssignable(id: string) {
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at, agreement_version)
     VALUES ($1,$2,'Designer','d@x.example', now(), (SELECT version FROM app.current_agreement('DESIGNER')))`,
    [generateId(), id],
  );
  await db.query(
    `INSERT INTO agreement_acceptances (agreement_id, user_id, content_sha256)
     SELECT id, $1, content_sha256 FROM app.current_agreement('DESIGNER')`,
    [id],
  );
}

/** A paid order in the North pod, at the given category. */
async function paidOrder(category = "C", status = "PAYMENT_HELD"): Promise<string> {
  const id = generateId();
  await db.query(
    `INSERT INTO orders (id, client_id, product_type, status, currency, price_total, designer_payout, qc_payout,
                         platform_commission, category, tier, complex_deadline_hours, pod_id, pod_lead_id)
     VALUES ($1,$2,'RING',$3,'USD',5500,0,0,5500,$4,(SELECT tier FROM job_categories WHERE letter=$4),
             CASE WHEN $4 >= 'G' THEN 48 END,$5,$6)`,
    [id, client, status, category, pod, podLead],
  );
  return id;
}

const status = async (id: string) =>
  (await db.query("SELECT status, work_version FROM orders WHERE id=$1", [id])).rows[0];

const DESIGNER_LINES = [101, 102, 103, 104, 105, 106, 107, 108, 109];
const MANAGER_LINES = [201, 202, 203, 204, 205];

async function passAll(id: string, stage: "designer" | "manager", who: string, except: number[] = []) {
  for (const item of stage === "designer" ? DESIGNER_LINES : MANAGER_LINES) {
    if (except.includes(item)) continue;
    await q(who, "SELECT public.mark_check($1,$2,'PASS')", [id, item]);
  }
}

async function fillSlots(id: string, except: string[] = []) {
  const { rows } = await db.query("SELECT code FROM deliverable_slots WHERE required ORDER BY position");
  for (const { code } of rows as { code: string }[]) {
    if (except.includes(code)) continue;
    await q(designer, "SELECT public.add_slot_file($1,$2,$3,$4,'application/octet-stream',10,'bin')", [
      generateId(), id, code, `slots/${generateId()}.bin`,
    ]);
  }
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'OPS','ACTIVE'), ($2,'QC','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'DESIGNER','ACTIVE'),
       ($5,'DESIGNER','ACTIVE'), ($6,'DESIGNER','ACTIVE'), ($7,'CLIENT','ACTIVE')`,
    [admin, podLead, otherLead, designer, busyDesigner, outsider, client],
  );
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [admin]);
  for (const d of [designer, busyDesigner, outsider]) await makeAssignable(d);

  pod = (await db.query("INSERT INTO pods (name) VALUES ('North') RETURNING id")).rows[0].id;
  const south = (await db.query("INSERT INTO pods (name) VALUES ('South') RETURNING id")).rows[0].id;
  await db.query(
    `INSERT INTO pod_members (pod_id, user_id, member_role) VALUES
       ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER'), ($1,$4,'DESIGNER'), ($5,$6,'POD_LEAD'), ($5,$7,'DESIGNER')`,
    [pod, podLead, designer, busyDesigner, south, otherLead, outsider],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describe("assignment (Spec §7)", () => {
  it("the pod lead assigns a designer from their pod; it is recorded", async () => {
    const id = await paidOrder();
    const r = await q(podLead, "SELECT public.assign_designer($1,$2) AS r", [id, designer]);
    expect(r.rows[0].r.to).toBe("ASSIGNED");
    expect(r.rows[0].r.warning).toBeNull();
    const a = await db.query("SELECT designer_id, assigned_by FROM job_assignments WHERE order_id=$1", [id]);
    expect(a.rows).toEqual([{ designer_id: designer, assigned_by: podLead }]);
    const note = await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='ASSIGNED' AND order_id=$2", [designer, id]);
    expect(note.rows).toHaveLength(1);
  });

  it("refuses a designer from another pod, another pod's lead, and a client", async () => {
    const id = await paidOrder();
    await expect(q(podLead, "SELECT public.assign_designer($1,$2)", [id, outsider])).rejects.toThrow(/not in this order's pod/i);
    await expect(q(otherLead, "SELECT public.assign_designer($1,$2)", [id, designer])).rejects.toThrow(/pod lead may assign/i);
    await expect(q(client, "SELECT public.assign_designer($1,$2)", [id, designer])).rejects.toThrow(/pod lead may assign/i);
  });

  it("lists the pod's designers with their load for the picker (lead and admin only)", async () => {
    const id = await paidOrder();
    const lead = await q(podLead, "SELECT designer_id, designer_ref, shift_minutes FROM public.pod_designers($1)", [id]);
    expect(lead.rows.map((r) => r.designer_id).sort()).toEqual([designer, busyDesigner].sort());
    expect(lead.rows[0].shift_minutes).toBe(480);
    await expect(q(otherLead, "SELECT * FROM public.pod_designers($1)", [id])).rejects.toThrow(/pod lead/i);
    await expect(q(designer, "SELECT * FROM public.pod_designers($1)", [id])).rejects.toThrow(/pod lead/i);
  });

  it("the 481st minute only warns while capacity_blocking is off", async () => {
    const big = await paidOrder("L"); // 480 minutes
    await q(podLead, "SELECT public.assign_designer($1,$2)", [big, busyDesigner]);
    const small = await paidOrder("A"); // +15
    const r = await q(podLead, "SELECT public.assign_designer($1,$2) AS r", [small, busyDesigner]);
    expect(r.rows[0].r.warning).toMatch(/Over capacity: 480 \+ 15 of 480/);
  });

  it("with capacity_blocking on, it is blocked without an admin override and a reason", async () => {
    await q(admin, "SELECT public.set_feature_flag('capacity_blocking', true)");
    try {
      const id = await paidOrder("B");
      await expect(q(podLead, "SELECT public.assign_designer($1,$2)", [id, busyDesigner])).rejects.toThrow(/Over capacity/);
      await expect(q(admin, "SELECT public.assign_designer($1,$2)", [id, busyDesigner])).rejects.toThrow(/override with a reason/);
      await q(admin, "SELECT public.assign_designer($1,$2,'rush week, approved')", [id, busyDesigner]);
      const a = await db.query("SELECT override_reason FROM job_assignments WHERE order_id=$1 AND ended_at IS NULL", [id]);
      expect(a.rows[0].override_reason).toBe("rush week, approved");
    } finally {
      await q(admin, "SELECT public.set_feature_flag('capacity_blocking', false)");
    }
  });

  it("the old transition_order ASSIGNED path follows the same rules", async () => {
    const id = await paidOrder();
    await expect(
      q(admin, "SELECT public.transition_order($1,'ASSIGNED',$2)", [id, JSON.stringify({ designer_id: outsider })]),
    ).rejects.toThrow(/not in this order's pod/i);
  });
});

describe("checklist + slots + submit (Spec §8–9, §12.5)", () => {
  let id: string;

  beforeAll(async () => {
    id = await paidOrder("C");
    await db.query("UPDATE orders SET job_code='RN-C-77' WHERE id=$1", [id]);
    await q(podLead, "SELECT public.assign_designer($1,$2)", [id, designer]);
  });

  it("the sheet: 9 designer lines, 5 QC manager lines; the 19 old lines kept, inactive", async () => {
    const { rows } = await db.query("SELECT id, stage FROM checklist_items WHERE active ORDER BY position");
    expect(rows.filter((r) => r.stage === "DESIGNER").map((r) => r.id)).toEqual(DESIGNER_LINES);
    expect(rows.filter((r) => r.stage === "MANAGER").map((r) => r.id)).toEqual(MANAGER_LINES);
    const old = await db.query("SELECT count(*)::int AS n FROM checklist_items WHERE NOT active AND stage = 'LEGACY'");
    expect(old.rows[0].n).toBe(19);
  });

  it("the designer marks only while IN_PROGRESS, and only the designer check", async () => {
    await expect(q(designer, "SELECT public.mark_check($1,101,'PASS')", [id])).rejects.toThrow(/in progress/i);
    await q(designer, "SELECT public.transition_order($1,'IN_PROGRESS')", [id]);
    await q(designer, "SELECT public.mark_check($1,101,'PASS','Ring size 7, 17.3 mm','Checked against the brief')", [id]);
    await expect(q(busyDesigner, "SELECT public.mark_check($1,102,'PASS')", [id])).rejects.toThrow(/assigned designer/i);
    await expect(q(designer, "SELECT public.mark_check($1,201,'PASS')", [id])).rejects.toThrow(/pod lead/i);
    await expect(q(designer, "SELECT public.mark_check($1,1,'PASS')", [id])).rejects.toThrow(/no such checklist item/i);
    await expect(q(designer, "SELECT public.mark_check($1,102,'MAYBE')", [id])).rejects.toThrow(/PASS or FAIL/i);
    await expect(q(designer, "SELECT public.mark_check($1,102,'PASS',$2)", [id, "x".repeat(301)])).rejects.toThrow(/300 characters/i);
    const line = await q(designer, "SELECT outcome, finding, remark, designer_at IS NOT NULL AS at FROM public.job_checklist($1) WHERE item_id = 101", [id]);
    expect(line.rows[0]).toEqual({ outcome: "PASS", finding: "Ring size 7, 17.3 mm", remark: "Checked against the brief", at: true });
  });

  it("a cleared line has no mark; tick_check still works as a pass for its own stage", async () => {
    await q(designer, "SELECT public.mark_check($1,101,NULL)", [id]);
    const cleared = await q(designer, "SELECT outcome, finding, designer_at FROM public.job_checklist($1) WHERE item_id = 101", [id]);
    expect(cleared.rows[0]).toEqual({ outcome: null, finding: null, designer_at: null });
    await q(designer, "SELECT public.tick_check($1,101,'designer')", [id]);
    await expect(q(designer, "SELECT public.tick_check($1,201,'designer')", [id])).rejects.toThrow(/manager check/i);
    const ticked = await q(designer, "SELECT outcome FROM public.job_checklist($1) WHERE item_id = 101", [id]);
    expect(ticked.rows[0].outcome).toBe("PASS");
  });

  it("slot uploads are named by the server with the job code, and replace within a version", async () => {
    const first = await q(designer, "SELECT public.add_slot_file($1,$2,'TV',$3,'image/png',10,'png') AS r", [
      generateId(), id, `slots/${generateId()}.png`,
    ]);
    expect(first.rows[0].r.file_name).toBe("RN-C-77_TV_v1.png");
    expect(first.rows[0].r.missing).toContain("3DM");
    await q(designer, "SELECT public.add_slot_file($1,$2,'TV',$3,'image/png',12,'png')", [
      generateId(), id, `slots/${generateId()}.png`,
    ]);
    const tv = await db.query("SELECT count(*)::int AS n FROM deliverables WHERE order_id=$1 AND slot='TV'", [id]);
    expect(tv.rows[0].n).toBe(1);
    const kinds = await db.query(
      "SELECT app.slot_kind('TV') AS tv, app.slot_kind('3DM') AS r, app.slot_kind('M') AS m, app.slot_kind('GW') AS gw, app.slot_kind('RENDER') AS render, app.slot_kind('TECH') AS tech",
    );
    expect(kinds.rows[0]).toEqual({ tv: "RENDER", r: "RHINO_3DM", m: "OTHER", gw: "WEIGHT_CHART", render: "RENDER", tech: "TECHNICAL_SHEET" });
    await expect(
      q(busyDesigner, "SELECT public.add_slot_file($1,$2,'PV','k','image/png',1,'png')", [generateId(), id]),
    ).rejects.toThrow(/assigned designer/i);
  });

  it("a version needs four files: 3DM, STL, render views, technical sheet (0056); old slots kept, optional", async () => {
    const { rows } = await db.query("SELECT code, required FROM deliverable_slots ORDER BY position");
    expect(rows.filter((r) => r.required).map((r) => r.code)).toEqual(["3DM", "STL", "RENDER", "TECH"]);
    expect(rows.map((r) => r.code)).toEqual(expect.arrayContaining(["TV", "PV", "GW", "DD", "SUMMARY"]));
  });

  it("designer uploads do not message the client", async () => {
    const n = await db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='FILE'", [client]);
    expect(n.rows[0].n).toBe(0);
  });

  it("cannot submit with a line unmarked, or failed", async () => {
    await fillSlots(id, ["TV"]);
    await passAll(id, "designer", designer, [109]);
    await expect(q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id])).rejects.toThrow(
      /every line of the designer check/i,
    );
    await q(designer, "SELECT public.mark_check($1,109,'FAIL','STL missing')", [id]);
    await expect(q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id])).rejects.toThrow(
      /every line of the designer check/i,
    );
  });

  it("cannot submit with a required slot empty — and says which", async () => {
    await db.query("DELETE FROM deliverables WHERE order_id=$1 AND slot='TECH'", [id]);
    await q(designer, "SELECT public.mark_check($1,109,'PASS')", [id]);
    await expect(q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id])).rejects.toThrow(
      /missing: TECH/,
    );
  });

  it("submitting goes straight to the pod lead's QC queue", async () => {
    await fillSlots(id, ["3DM", "STL", "RENDER"]); // only TECH was missing
    // Phase 7a (0050): the model volume first.
    await expect(q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id])).rejects.toThrow(/model volume/i);
    await q(designer, "SELECT public.set_job_volume($1, 312.5)", [id]);
    const r = await q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED') AS r", [id]);
    expect(r.rows[0].r.to).toBe("QC_REVIEW");
    expect((await status(id)).status).toBe("QC_REVIEW");
    const note = await db.query("SELECT 1 FROM notifications WHERE user_id=$1 AND kind='QC' AND order_id=$2", [podLead, id]);
    expect(note.rows).toHaveLength(1);
    // The designer check is closed once submitted.
    await expect(q(designer, "SELECT public.mark_check($1,101,'FAIL')", [id])).rejects.toThrow(/in progress/i);
  });

  it("QC cannot pass with a manager line unmarked or failed; another pod's lead cannot mark", async () => {
    await expect(q(otherLead, "SELECT public.mark_check($1,201,'PASS')", [id])).rejects.toThrow(/pod lead/i);
    await passAll(id, "manager", podLead, [205]);
    await expect(q(podLead, "SELECT public.qc_decide($1,'PASS')", [id])).rejects.toThrow(/every line of the QC manager check/i);
    await q(podLead, "SELECT public.mark_check($1,203,'FAIL','Shank 1.1 mm at the base','Brief asks 1.4 mm minimum')", [id]);
    await q(podLead, "SELECT public.mark_check($1,205,'FAIL',NULL,'Engraving missing')", [id]);
    await expect(q(podLead, "SELECT public.qc_decide($1,'PASS')", [id])).rejects.toThrow(/every line of the QC manager check/i);
  });

  it("sending back writes the note from the failed lines, opens version 2 with an empty checklist", async () => {
    await expect(q(podLead, "SELECT public.qc_decide($1,'MAYBE')", [id])).rejects.toThrow(/PASS or REVISION/i);
    await q(podLead, "SELECT public.qc_decide($1,'REVISION','Please also soften the gallery.')", [id]);
    expect(await status(id)).toEqual({ status: "REVISION_REQUESTED", work_version: 2 });

    const msgs = await q(designer, "SELECT body, sender_alias FROM public.order_messages($1)", [id]);
    expect(msgs.rows).toEqual([
      {
        body: [
          "Sent back by QC: Failed checks:",
          "- All measurements — Shank 1.1 mm at the base — Brief asks 1.4 mm minimum",
          "- Client's special remarks — Engraving missing",
          "Please also soften the gallery.",
        ].join("\n"),
        sender_alias: "Team",
      },
    ]);

    await q(designer, "SELECT public.transition_order($1,'IN_PROGRESS')", [id]);
    const list = await q(designer, "SELECT count(*) FILTER (WHERE designer_at IS NOT NULL OR qc_at IS NOT NULL)::int AS marked FROM public.job_checklist($1)", [id]);
    expect(list.rows[0].marked).toBe(0);
    const slots = await q(designer, "SELECT count(file_version_id)::int AS filled FROM public.job_slots($1)", [id]);
    expect(slots.rows[0].filled).toBe(0);
    const named = await q(designer, "SELECT public.add_slot_file($1,$2,'TV','k2','image/png',1,'png') AS r", [generateId(), id]);
    expect(named.rows[0].r.file_name).toBe("RN-C-77_TV_v2.png");
  });

  it("the QC manager check is open only in QC review", async () => {
    await expect(q(podLead, "SELECT public.mark_check($1,201,'PASS')", [id])).rejects.toThrow(/only in QC review/i);
  });

  it("a send-back needs a failed line or a note", async () => {
    const other = await paidOrder("C");
    await q(podLead, "SELECT public.assign_designer($1,$2)", [other, designer]);
    await db.query("UPDATE orders SET status='QC_REVIEW' WHERE id=$1", [other]);
    await expect(q(podLead, "SELECT public.qc_decide($1,'REVISION','  ')", [other])).rejects.toThrow(/written note/i);
    await q(podLead, "SELECT public.qc_decide($1,'REVISION','Shank too thin at the base')", [other]);
    const msgs = await q(designer, "SELECT body FROM public.order_messages($1)", [other]);
    expect(msgs.rows).toEqual([{ body: "Sent back by QC: Shank too thin at the base" }]);
  });

  it("a full second pass reaches the client", async () => {
    await fillSlots(id, ["TV"]);
    await passAll(id, "designer", designer);
    await q(designer, "SELECT public.set_job_volume($1, 298)", [id]);
    await q(designer, "SELECT public.transition_order($1,'DESIGNER_SUBMITTED')", [id]);
    await passAll(id, "manager", podLead);
    // Phase 7a (0050): the measured minimums, with no open edges.
    await expect(q(podLead, "SELECT public.qc_decide($1,'PASS')", [id])).rejects.toThrow(/QC measurements/i);
    await q(podLead, "SELECT public.record_qc_measurements($1, 820, 810, '[]'::jsonb, 'US 6.5', NULL, 5, 2)", [id]);
    await expect(q(podLead, "SELECT public.qc_decide($1,'PASS')", [id])).rejects.toThrow(/open edges/i);
    await q(podLead, "SELECT public.record_qc_measurements($1, 820, 810, '[]'::jsonb, 'US 6.5', NULL, 5, 0)", [id]);
    await q(podLead, "SELECT public.qc_decide($1,'PASS')", [id]);
    expect((await status(id)).status).toBe("CLIENT_PREVIEW");
  });

  it("the checklist and slots are for the designer, pod lead and admin — never the client", async () => {
    await expect(q(client, "SELECT * FROM public.job_checklist($1)", [id])).rejects.toThrow(/order not found/i);
    await expect(q(client, "SELECT * FROM public.job_slots($1)", [id])).rejects.toThrow(/order not found/i);
    expect((await q(podLead, "SELECT * FROM public.job_checklist($1)", [id])).rows).toHaveLength(14);
    expect((await q(admin, "SELECT * FROM public.job_slots($1)", [id])).rows).toHaveLength(15);
    await expect(q(client, "SELECT public.mark_check($1,101,'PASS')", [id])).rejects.toThrow(/assigned designer/i);
    await expect(q(client, "SELECT public.qc_decide($1,'PASS')", [id])).rejects.toThrow(/only QC/i);
  });

  it("every mark is audited and the chain holds", async () => {
    const n = await db.query("SELECT count(*)::int AS n FROM audit.audit_log WHERE action='CHECK_MARKED' AND entity_id=$1", [id]);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(9 * 2 + 5 * 2);
    const v = await db.query("SELECT audit.verify_chain() AS v");
    expect(v.rows[0].v.valid).toBe(true);
  });
});
