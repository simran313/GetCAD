import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CHECK_GROUPS } from "../../components/marketing/content";
import { connectFreshDb } from "../helpers/db";

/** /quality lists the same 18 checks the portal's checklist ticks (0041). */
let db: Client;
beforeAll(async () => {
  db = await connectFreshDb();
});
afterAll(async () => {
  if (db) await db.end();
});

describe("the website's checklist", () => {
  it("matches the portal's, group by group", async () => {
    const { rows } = await db.query("SELECT group_name, label FROM checklist_items WHERE NOT is_signoff ORDER BY id");
    const site = CHECK_GROUPS.flatMap((g) => g.checks.map((c) => ({ group_name: g.group, label: c }))).slice(0, 18);
    expect(site).toEqual(rows);
  });
});
