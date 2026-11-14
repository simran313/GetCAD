import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectFreshDb } from "../helpers/db";

/**
 * Who may call which database function directly (0067; security register
 * SEC-06 and SEC-11). PostgreSQL grants EXECUTE to PUBLIC by default, so a new
 * function is callable by signed-out (`anon`) and signed-in (`authenticated`)
 * roles unless revoked. Internal helpers must be reachable only from inside
 * other functions and triggers, and signed-out visitors may call only the
 * website's own entry points.
 */
let db: Client;

beforeAll(async () => {
  db = await connectFreshDb();
});

afterAll(async () => {
  await db?.end();
});

const can = async (role: string, fn: string): Promise<boolean> =>
  (await db.query("SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS ok", [role, fn])).rows[0].ok;

/** The website forms a signed-out visitor submits: the only writes `anon` may call. */
const PUBLIC_ENTRY_POINTS = [
  "public.check_rate_limit",
  "public.record_marketing_event",
  "public.start_brief_lead",
  "public.submit_designer_application",
  "public.submit_marketing_lead",
].sort();

describe("database function grants", () => {
  it("lets signed-out visitors call no writing function except the website's entry points", async () => {
    const { rows } = await db.query(
      `SELECT DISTINCT format('%s.%s', n.nspname, p.proname) AS fn
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('public', 'app') AND p.prokind = 'f' AND p.provolatile = 'v'
          AND pg_get_function_result(p.oid) <> 'trigger'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual(PUBLIC_ENTRY_POINTS);
  });

  it("keeps the internal helpers that write or report on other people closed to direct callers", async () => {
    for (const fn of [
      "app.enqueue_email(text, text, jsonb, text)",
      "app.notify(text, text, text, text, text)",
      "app.payout_account_status(text)",
      "app.designer_is_assignable(text)",
      "app.current_agreement(text)",
    ]) {
      expect(await can("anon", fn), `${fn} as anon`).toBe(false);
      expect(await can("authenticated", fn), `${fn} as authenticated`).toBe(false);
    }
  });

  it("keeps what RLS and signed-in clients need", async () => {
    expect(await can("authenticated", "app.client_in_my_pods(text)")).toBe(true);
    expect(await can("anon", "app.client_in_my_pods(text)")).toBe(false);
    for (const fn of [
      "public.add_reference_image(text, text, text, integer)",
      "public.remove_reference_image(text)",
      "public.set_order_accents(text, stone_shape[], integer[], integer[], setting_type[])",
      "public.set_primary_reference(text)",
      "public.set_reference_pins(text, integer[], integer[], text[])",
    ]) {
      expect(await can("authenticated", fn), `${fn} as authenticated`).toBe(true);
      expect(await can("anon", fn), `${fn} as anon`).toBe(false);
    }
  });
});
