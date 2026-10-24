import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/**
 * Connection string for the throwaway test Postgres.
 * Defaults to the local cluster used in dev/CI; override with DATABASE_URL.
 */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5433/postgres";

/**
 * Hosts this harness is allowed to destroy.
 *
 * WHY THIS EXISTS. `freshSchema` below drops `public`, `app` and `audit`. That
 * is correct and necessary for a deterministic suite, and catastrophic against
 * anything else. The one thing standing between the two was an environment
 * variable — and `DATABASE_URL` is exported into a shell for perfectly ordinary
 * reasons (`db:apply`, `verify:payment`, `verify:delivery`), where it then
 * lingers for the rest of the session.
 *
 * It has happened: a production Supabase database was dropped and rebuilt
 * because `npm run ci` ran in a terminal where `export DATABASE_URL=…` was
 * still set from a migration run half an hour earlier. Nothing about that
 * sequence looks dangerous while you are typing it.
 *
 * A README warning is not a control. This is.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "db", "test-db"]);

/**
 * Refuse to run the destructive harness against anything but a local database.
 *
 * The escape hatch is deliberately awkward to type and impossible to set by
 * accident, for the rare case of running the suite against a disposable remote
 * container in CI.
 */
export function assertDestroyable(connectionString: string): void {
  if (process.env.I_KNOW_THIS_DATABASE_IS_DISPOSABLE === "yes") return;

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error(
      `The test harness could not parse DATABASE_URL, and it will not drop schemas ` +
        `in a database it cannot identify.`,
    );
  }

  if (LOCAL_HOSTS.has(host)) return;

  throw new Error(
    `\n\nREFUSING TO RUN: the test harness drops the public, app and audit schemas,\n` +
      `and DATABASE_URL points at "${host}" — not a local database.\n\n` +
      `This is almost always a shell where DATABASE_URL was exported for db:apply\n` +
      `or verify:payment and never unset. Open a new terminal, or run:\n\n` +
      `    unset DATABASE_URL\n\n` +
      `The suite uses a throwaway Postgres on 127.0.0.1:5433 (npm run test:db:up).\n`,
  );
}

function sqlFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Reset `public` to empty, then apply all migrations + policies in order.
 * Gives every test run an identical, fully-built schema.
 */
export async function freshSchema(client: Client): Promise<void> {
  // Checked here as well as at connect time: this function is exported, and the
  // guard belongs immediately in front of the DROP rather than only on the
  // path that usually reaches it.
  assertDestroyable(TEST_DATABASE_URL);
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("DROP SCHEMA IF EXISTS app CASCADE");
  await client.query("DROP SCHEMA IF EXISTS audit CASCADE");
  await client.query("CREATE SCHEMA public");
  const files = [
    ...sqlFilesIn(join(repoRoot, "db", "migrations")),
    ...sqlFilesIn(join(repoRoot, "db", "policies")),
  ];
  for (const file of files) {
    await client.query(readFileSync(file, "utf8"));
  }
}

/**
 * Give a user a payout account in a chosen state.
 *
 * Since 0023 a RELEASE leg requires a VERIFIED payout account for its payee,
 * so any suite that releases escrow needs its designer/QC fixture to be
 * payable. Inserted directly rather than through upsert_payout_account(),
 * which needs an authenticated session for that specific user — this is
 * fixture setup, not a test of the write path.
 */
export async function givePayoutAccount(
  client: Client,
  userId: string,
  status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" = "VERIFIED",
): Promise<void> {
  await client.query(
    `INSERT INTO payout_accounts
       (user_id, beneficiary_name, pan, account_number, ifsc, account_type, status, rejection_reason)
     VALUES ($1, 'Test Beneficiary', 'ABCDE1234F', '123456789012', 'HDFC0001234', 'SAVINGS', $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET status = EXCLUDED.status, rejection_reason = EXCLUDED.rejection_reason`,
    [userId, status, status === "REJECTED" ? "fixture rejection" : null],
  );
}

/** Connect, apply a fresh schema, and hand back the client. */
export async function connectFreshDb(): Promise<Client> {
  // Before connecting, not after: there is no reason to open a session against
  // a database we are about to refuse to touch.
  assertDestroyable(TEST_DATABASE_URL);
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await freshSchema(client);
  return client;
}

/**
 * Put an order in a pod led by `podLeadId` (0033).
 *
 * QC decisions and pod-lead visibility belong to the pod lead of the order's
 * pod, so any suite that walks an order through QC needs one. Fixture setup,
 * written directly as the superuser: assign_order_pod() needs an admin
 * session, and this is not a test of that path.
 */
export async function putOrderInPod(client: Client, orderId: string, podLeadId: string): Promise<string> {
  const existing = await client.query("SELECT pod_id FROM pod_members WHERE user_id = $1", [podLeadId]);
  let podId: string;
  if (existing.rows.length > 0) {
    podId = existing.rows[0].pod_id as string;
  } else {
    const pod = await client.query("INSERT INTO pods (name) VALUES ($1) RETURNING id", [`Pod ${podLeadId}`]);
    podId = pod.rows[0].id as string;
    await client.query(
      "INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1, $2, 'POD_LEAD')",
      [podId, podLeadId],
    );
  }
  await client.query("UPDATE orders SET pod_id = $1, pod_lead_id = $2 WHERE id = $3", [podId, podLeadId, orderId]);
  return podId;
}

/**
 * Do the designer's side of the current work version (0041): all 19 designer
 * ticks and a file in every required slot. Fixture setup as the superuser —
 * tick_check / add_slot_file have their own suite (tests/db/checklist_slots).
 */
export async function completeDesignerWork(client: Client, orderId: string, designerId: string): Promise<void> {
  const { rows } = await client.query("SELECT work_version FROM orders WHERE id = $1", [orderId]);
  const version = rows[0].work_version as number;
  await client.query(
    `INSERT INTO order_checks (order_id, version, item_id, designer_by, designer_at)
     SELECT $1, $2, id, $3, now() FROM checklist_items
     ON CONFLICT (order_id, version, item_id) DO UPDATE
       SET designer_by = EXCLUDED.designer_by, designer_at = EXCLUDED.designer_at`,
    [orderId, version, designerId],
  );
  // The model volume for this version (0050): a CAD version cannot be
  // submitted without it.
  await client.query(
    `INSERT INTO job_volumes (order_id, version, volume_mm3, entered_by) VALUES ($1, $2, 250, $3)
     ON CONFLICT (order_id, version) DO NOTHING`,
    [orderId, version, designerId],
  );
  const slots = await client.query("SELECT code FROM deliverable_slots WHERE required ORDER BY position");
  for (const { code } of slots.rows as { code: string }[]) {
    const fileId = `fx_${orderId}_${code}_${version}`;
    const { rows: no } = await client.query(
      "SELECT coalesce(max(version_no), 0) + 1 AS n FROM file_versions WHERE order_id = $1",
      [orderId],
    );
    await client.query(
      `INSERT INTO file_versions (id, order_id, version_no, object_key, content_type, size_bytes, uploaded_by, kind)
       VALUES ($1, $2, $3, $4, 'application/octet-stream', 1, $5, app.slot_kind($6))`,
      [fileId, orderId, no[0].n, `fixtures/${fileId}`, designerId, code],
    );
    await client.query(
      `INSERT INTO deliverables (order_id, slot, version, file_version_id, file_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, code, version, fileId, `${code}_v${version}.bin`],
    );
  }
}

/** Tick all 19 QC lines of the current version (0041), as the given pod lead. */
export async function completeQcTicks(client: Client, orderId: string, podLeadId: string): Promise<void> {
  await client.query(
    `INSERT INTO order_checks (order_id, version, item_id, qc_by, qc_at)
     SELECT o.id, o.work_version, i.id, $2, now() FROM orders o CROSS JOIN checklist_items i
     WHERE o.id = $1
     ON CONFLICT (order_id, version, item_id) DO UPDATE SET qc_by = EXCLUDED.qc_by, qc_at = EXCLUDED.qc_at`,
    [orderId, podLeadId],
  );
  // The QC measurements for this version (0050): a CAD version cannot pass
  // without them.
  await client.query(
    `INSERT INTO qc_measurements (order_id, version, min_wall_um, min_prong_um, recorded_by)
     SELECT id, work_version, 800, 800, $2 FROM orders WHERE id = $1
     ON CONFLICT (order_id, version) DO NOTHING`,
    [orderId, podLeadId],
  );
}
