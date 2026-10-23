import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateId } from "../../core/ids/generateId";
import { connectFreshDb, putOrderInPod } from "../helpers/db";

/**
 * Phase 1 must-fix: a designer cannot get ANY client identifier from any
 * message, file or response — and cannot tell that two orders share a client.
 *
 * This does not list the surfaces it checks. It asks the catalogue for every
 * column the `authenticated` role may SELECT and every function it may
 * EXECUTE, reads or calls each one as the designer, and scans everything that
 * comes back. A table or function added later is covered the day it lands.
 *
 * Two assertions over the collected values:
 *   1. No client identifier appears anywhere: the client's user id, profile
 *      id, legal and business names, email, phone, client code, either full
 *      order reference, the reference name, the price, or any other person's
 *      user id.
 *   2. No identifier is shared between the two orders: every value seen for
 *      order A and for order B is compared, and the overlap may contain only
 *      labels (enum values, statuses, aliases) — nothing that could link them.
 */

let db: Client;

const client = generateId();
const designer = generateId();
const podLead = generateId();
const admin = generateId();
const clientProfileId = generateId();
const orderA = generateId();
const orderB = generateId();

const PRICE = 7919; // distinctive, so a leak of it is recognisable
const SECRETS = {
  legalName: "Meera Quixote",
  businessName: "Quixotic Zircon Atelier",
  email: "meera@quixotic-zircon.example",
  phone: "+1 555 0142 7788",
  referenceName: "Smithers engagement",
};

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

async function fund(orderId: string): Promise<void> {
  const ref = `order_rp_${orderId}`;
  await db.query("SELECT public.open_payment_intent($1,$2)", [orderId, ref]);
  await db.query("SELECT public.confirm_payment($1,$2,'USD',$3,$4)", [ref, PRICE, `test:${ref}`, `pay_${orderId}`]);
}

async function buildOrder(id: string, basedOn: string | null, note: string): Promise<void> {
  await asUser(client, () => db.query("SELECT public.create_order($1,'Quixotic custom ring','USD')", [id]));
  await asUser(client, () =>
    db.query(
      `SELECT public.upsert_order_spec(
         p_order_id => $1, p_reference_name => $2, p_product => 'RING', p_metal => 'YELLOW',
         p_karatage => '18K', p_ring_size => 'US 6.5', p_notes => $3,
         p_based_on_order_id => $4, p_change_summary => $5)`,
      [id, SECRETS.referenceName, note, basedOn, basedOn ? `Thinner band than before (${id.slice(0, 4)})` : null],
    ),
  );
  await asUser(client, () =>
    db.query("SELECT public.add_reference_image($1,$2,'image/png',1234)", [id, `refs/${generateId()}.png`]),
  );
  await asUser(client, () =>
    db.query("SELECT public.add_file_version($1,$2,$3,'application/pdf',99,'CLIENT_REFERENCE')", [
      generateId(), id, `files/${generateId()}`,
    ]),
  );
  await asUser(client, () => db.query("SELECT public.transition_order($1,'SUBMITTED')", [id]));
  await asUser(admin, () => db.query("SELECT public.quote_order($1,$2,$3,0,0)", [id, PRICE, 0]).catch(() => null));
  // quote_order needs the split to sum to the price; keep it simple and valid.
  await asUser(admin, () => db.query("SELECT public.quote_order($1,$2,$3,0,0)", [id, PRICE, PRICE]).catch(() => null));
  await fund(id);
  await asUser(admin, () => db.query("SELECT public.assign_order_pod($1,$2)", [id, podLead]));
  await asUser(admin, () =>
    db.query("SELECT public.transition_order($1,'ASSIGNED',$2)", [id, JSON.stringify({ designer_id: designer })]),
  );
  await asUser(designer, () => db.query("SELECT public.transition_order($1,'IN_PROGRESS')", [id]));
  await asUser(designer, () =>
    db.query("SELECT public.add_file_version($1,$2,$3,'image/png',4321,'RENDER')", [
      generateId(), id, `files/${generateId()}`,
    ]),
  );

  // Messages in both threads, from everyone.
  await asUser(client, () => db.query("SELECT public.post_message($1,$2)", [id, `Client note for ${id}`]));
  await asUser(designer, () => db.query("SELECT public.post_message($1,$2)", [id, `Designer question on ${id}`]));
  const threads = await db.query("SELECT id, kind FROM message_threads WHERE order_id=$1", [id]);
  for (const t of threads.rows) {
    await asUser(podLead, () =>
      db.query("SELECT public.post_thread_message($1,$2)", [t.id, `Lead reply in ${t.kind} for ${id}`]),
    );
  }

  // Rows for the later-phase tables, written as the superuser (no writers yet).
  await db.query(
    "INSERT INTO order_screenshots (order_id, object_key, content_type, size_bytes, position, added_by) VALUES ($1,$2,'image/png',10,1,$3)",
    [id, `shots/${generateId()}.png`, admin],
  );
  await db.query(
    "INSERT INTO client_credits (client_id, order_id, kind, amount_cents, currency) VALUES ($1,$2,'sla_credit',$3,'USD')",
    [client, id, PRICE],
  );
  await db.query(
    "INSERT INTO payout_obligations (order_id, payee_id, party, amount_paise) VALUES ($1,$2,'DESIGNER',50000)",
    [id, designer],
  );
  await db.query(
    "INSERT INTO job_assignments (order_id, designer_id, assigned_by) VALUES ($1,$2,$3)",
    [id, designer, podLead],
  );
  await db.query(
    "INSERT INTO order_checks (order_id, version, item_id, designer_by, designer_at) VALUES ($1,1,1,$2,now())",
    [id, designer],
  );
  await db.query("INSERT INTO sla_events (order_id, kind) VALUES ($1,'started')", [id]);
}

beforeAll(async () => {
  db = await connectFreshDb();
  await db.query(
    `INSERT INTO users (id, role, status) VALUES
       ($1,'CLIENT','ACTIVE'), ($2,'DESIGNER','ACTIVE'), ($3,'QC','ACTIVE'), ($4,'OPS','ACTIVE')`,
    [client, designer, podLead, admin],
  );
  await db.query(
    "INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')",
    [admin],
  );
  await db.query(
    `INSERT INTO client_profiles (id, user_id, legal_name, email, phone, business_name)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [clientProfileId, client, SECRETS.legalName, SECRETS.email, SECRETS.phone, SECRETS.businessName],
  );
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at, agreement_version)
     VALUES ($1,$2,'Dana Designer','dana@studio.example', now(), (SELECT version FROM app.current_agreement('DESIGNER')))`,
    [generateId(), designer],
  );
  await db.query(
    `INSERT INTO agreement_acceptances (agreement_id, user_id, content_sha256)
     SELECT id, $1, content_sha256 FROM app.current_agreement('DESIGNER')`,
    [designer],
  );
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Priya')", [podLead]);
  const pod = await db.query("INSERT INTO pods (name) VALUES ('North') RETURNING id");
  await db.query(
    "INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER')",
    [pod.rows[0].id, podLead, designer],
  );

  await buildOrder(orderA, null, "Keep the shank comfort-fit");
  await buildOrder(orderB, orderA, "Match the earlier gallery height");
  // A dispute on A, raised by the client.
  await asUser(client, () => db.query("SELECT public.raise_dispute($1,'Prongs look thin')", [orderA]));

  // Sanity: both orders really belong to the same client and the same designer.
  const check = await db.query("SELECT client_id, designer_id, order_ref FROM orders WHERE id = ANY($1)", [[orderA, orderB]]);
  expect(check.rows.every((r) => r.client_id === client && r.designer_id === designer)).toBe(true);
  expect(check.rows.every((r) => String(r.order_ref).startsWith("QZ1-"))).toBe(true);
  // putOrderInPod is unused here on purpose: the pod comes from assign_order_pod.
  void putOrderInPod;
});

afterAll(async () => {
  if (db) await db.end();
});

// ------------------------------------------------------------ collection --

interface Seen {
  strings: Set<string>;
  numbers: Set<number>;
}

const emptySeen = (): Seen => ({ strings: new Set(), numbers: new Set() });

function collect(value: unknown, into: Seen): void {
  if (value === null || value === undefined || value instanceof Date) return;
  if (typeof value === "string") {
    into.strings.add(value);
    if (/^-?\d+$/.test(value)) into.numbers.add(Number(value));
    return;
  }
  if (typeof value === "number") {
    into.numbers.add(value);
    return;
  }
  if (typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, into);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collect(v, into);
  }
}

interface FnRow {
  schema: string;
  name: string;
  args: string;
  argtypes: string[];
  required: number;
}

async function selectableColumns(): Promise<Map<string, string[]>> {
  const { rows } = await db.query(`
    SELECT table_schema || '.' || table_name AS t, array_agg(column_name::text ORDER BY column_name) AS cols
    FROM information_schema.column_privileges
    WHERE grantee = 'authenticated' AND privilege_type = 'SELECT'
      AND table_schema IN ('public', 'app', 'audit')
    GROUP BY 1`);
  return new Map(rows.map((r) => [r.t as string, r.cols as string[]]));
}

async function executableFunctions(): Promise<FnRow[]> {
  const { rows } = await db.query(`
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           coalesce((SELECT array_agg(format_type(t, NULL) ORDER BY i)
                     FROM unnest(p.proargtypes) WITH ORDINALITY AS a(t, i)), '{}') AS argtypes,
           p.pronargs - p.pronargdefaults AS required
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app', 'audit')
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY 1, 2, 3`);
  return rows as FnRow[];
}

/** Call fn as the designer with `firstText` for its first text argument, inside a rolled-back savepoint. */
async function callAsDesigner(fn: FnRow, firstText: string): Promise<unknown[] | null> {
  const enumDefaults: Record<string, string> = {};
  const args: string[] = [];
  const params: unknown[] = [];
  let usedText = false;
  for (let i = 0; i < fn.required; i++) {
    const t = fn.argtypes[i] ?? "text";
    let v: unknown;
    if (t === "text") {
      v = usedText ? "x" : firstText;
      usedText = true;
    } else if (t === "integer" || t === "bigint" || t === "smallint") v = 1;
    else if (t === "boolean") v = true;
    else if (t === "jsonb" || t === "json") v = "{}";
    else if (t.endsWith("[]")) v = "{}";
    else {
      if (!(t in enumDefaults)) {
        const e = await db.query(
          "SELECT enumlabel FROM pg_enum WHERE enumtypid = $1::regtype ORDER BY enumsortorder LIMIT 1",
          [t],
        ).catch(() => ({ rows: [] as { enumlabel: string }[] }));
        enumDefaults[t] = e.rows[0]?.enumlabel ?? "";
      }
      v = enumDefaults[t];
    }
    params.push(v);
    args.push(`$${params.length}::${t}`);
  }
  const sql = `SELECT * FROM ${fn.schema}.${fn.name}(${args.join(", ")}) AS r`;
  await db.query("SAVEPOINT probe");
  try {
    const res = await asUser(designer, () => db.query(sql, params));
    return res.rows;
  } catch {
    return null;
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT probe");
  }
}

let everything: Seen;
let perOrder: { a: Seen; b: Seen };
let probedFunctions: string[];

describe("Phase 1 must-fix — a designer cannot identify or link a client", () => {
  beforeAll(async () => {
    everything = emptySeen();
    perOrder = { a: emptySeen(), b: emptySeen() };
    probedFunctions = [];

    await db.query("BEGIN");

    // 1. Every selectable column of every table, as the designer.
    for (const [table, cols] of await selectableColumns()) {
      const quoted = cols.map((c) => `"${c}"`).join(", ");
      const { rows } = await asUser(designer, () => db.query(`SELECT ${quoted} FROM ${table}`)).catch((e) => {
        throw new Error(`granted columns of ${table} are not selectable: ${(e as Error).message}`);
      });
      for (const row of rows) {
        collect(row, everything);
        if (row.order_id === orderA || row.id === orderA) collect(row, perOrder.a);
        if (row.order_id === orderB || row.id === orderB) collect(row, perOrder.b);
      }
    }

    // Ids the designer has legitimately seen are the arguments we probe with.
    const candidateIds = [...everything.strings].filter((s) => /^[A-Za-z0-9_-]{8,}$/.test(s));

    // 2. Every executable function, called with each order id and each seen id.
    for (const fn of await executableFunctions()) {
      probedFunctions.push(`${fn.schema}.${fn.name}(${fn.args})`);
      const firstArgIsText = fn.required > 0 && fn.argtypes[0] === "text";
      const candidates = firstArgIsText ? [orderA, orderB, ...candidateIds] : [""];
      for (const c of candidates) {
        const rows = await callAsDesigner(fn, c);
        if (!rows) continue;
        collect(rows, everything);
        if (c === orderA) collect(rows, perOrder.a);
        if (c === orderB) collect(rows, perOrder.b);
      }
    }

    await db.query("COMMIT");
  });

  it("actually probed the surfaces that matter (the test is not vacuous)", () => {
    for (const fn of ["visible_orders", "job_brief", "order_messages", "order_timeline", "post_message"]) {
      expect(probedFunctions.some((f) => f.startsWith(`public.${fn}(`))).toBe(true);
    }
    // The designer saw their jobs, their own messages and the brief.
    expect(everything.strings.has(`Designer question on ${orderA}`)).toBe(true);
    expect(everything.strings.has("Keep the shank comfort-fit")).toBe(true);
    expect([...everything.strings].some((s) => /^RN-C-\d+$/.test(s))).toBe(true);
  });

  it("no client identifier appears in any column or function result", async () => {
    const refs = await db.query("SELECT order_ref, job_code FROM orders WHERE id = ANY($1)", [[orderA, orderB]]);
    const forbidden = [
      client,
      clientProfileId,
      podLead,
      admin,
      SECRETS.legalName,
      SECRETS.businessName,
      SECRETS.email,
      SECRETS.phone,
      SECRETS.referenceName,
      "Quixotic custom ring", // free-text product type the client typed
      "QZ1-",
      ...refs.rows.map((r) => r.order_ref as string),
    ];
    const leaks: string[] = [];
    for (const s of everything.strings) {
      for (const f of forbidden) {
        if (s.includes(f)) leaks.push(`${JSON.stringify(f)} in ${JSON.stringify(s.slice(0, 80))}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("the price never reaches the designer", () => {
    expect(everything.numbers.has(PRICE)).toBe(false);
  });

  it("nothing identifying is shared between two orders of the same client", async () => {
    const enums = await db.query("SELECT enumlabel FROM pg_enum");
    const labels = new Set<string>(enums.rows.map((r) => r.enumlabel as string));
    const isLabel = (s: string) =>
      labels.has(s) ||
      /^[A-Z][A-Z_]{3,}$/.test(s) || // statuses, actions, parties
      /^\d{4}-\d{2}-\d{2}/.test(s) || // timestamps rendered inside json
      /^-?\d+$/.test(s) ||
      [
        "Designer", "Team · Priya", "internal", "client_team", "DESIGNER", "TEAM",
        "", "owed", "OT", // payout status; app.product_code() of an unknown product
        // notification summaries: fixed sentences, the same for every order
        "You have been assigned to an order.", "New message from the team.",
        "image/png", "application/pdf",
        "18K", // karat: a spec value, not an identifier
        "US 6.5", // ring size: a spec value
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", // categories
        designer, // the designer's own id
      ].includes(s);

    const shared = [...perOrder.a.strings].filter((s) => perOrder.b.strings.has(s) && !isLabel(s));
    expect(shared).toEqual([]);
  });

  it("raw identity columns are not selectable at all", async () => {
    for (const sql of [
      "SELECT client_id FROM orders",
      "SELECT sender_id FROM messages",
      "SELECT uploaded_by FROM file_versions",
      "SELECT raised_by FROM disputes",
      "SELECT created_by FROM escrow_ledger",
      "SELECT client_id FROM client_credits",
      "SELECT user_id FROM thread_participants",
    ]) {
      await db.query("SAVEPOINT s").catch(() => null);
      await expect(asUser(designer, () => db.query(sql))).rejects.toThrow(/permission denied/i);
    }
  });

  it("the client cannot see the designer either (and gets prices, the full ref)", async () => {
    const rows = await asUser(client, () => db.query("SELECT * FROM public.visible_orders()"));
    expect(rows.rows).toHaveLength(2);
    for (const r of rows.rows) {
      expect(r.relation).toBe("CLIENT");
      expect(r.display_ref).toMatch(/^QZ1-RN-C-\d+$/);
      expect(r.price_total).toBe(PRICE);
      expect(r.designer_payout_paise).toBeNull();
      expect(JSON.stringify(r)).not.toContain(designer);
    }
    const msgs = await asUser(client, () => db.query("SELECT * FROM public.order_messages($1)", [orderA]));
    expect(JSON.stringify(msgs.rows)).not.toContain(designer);
    expect(JSON.stringify(msgs.rows)).not.toContain(podLead);
    expect(msgs.rows.every((m) => m.thread_kind === "client_team")).toBe(true);
  });
});
