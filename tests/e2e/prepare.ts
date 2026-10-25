/**
 * Phase 8 e2e — prepare the throwaway stack before Playwright runs.
 *
 *   1. Rebuild the local test database from every migration and policy.
 *   2. Make the PostgREST login role and the keys the app uses for it.
 *   3. Find or create one Clerk test user per persona in the development
 *      Clerk instance, and give each its role, pod and profile here.
 *   4. Seed the orders the anonymity crawl reads.
 *   5. Write .e2e/state.json (who is who) and .e2e/jwks.json (the keys
 *      PostgREST trusts: Clerk's, and the local key that signs the anon and
 *      service-role tokens).
 *
 * Run: npx tsx tests/e2e/prepare.ts   (needs CLERK_SECRET_KEY,
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, and a local DATABASE_URL)
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClerkClient } from "@clerk/backend";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Client } from "pg";

import { generateId } from "../../core/ids/generateId";
import { assertDestroyable, freshSchema, TEST_DATABASE_URL } from "../helpers/db";
import { asUser } from "./db";
import { clerkIssuer, E2E_DIR, PERSONAS, type E2eState, type Persona } from "./state";

// Pasted secrets often carry a stray space, newline or quotes: drop them here,
// and hand the cleaned keys to the build and the tests through app.env.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']+|["']+$/g, "");
const secretKey = clean(process.env.CLERK_SECRET_KEY);
const publishableKey = clean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
// What kind of key a value is, without printing any of the key itself.
const kind = (v: string) => v.match(/^(sk|pk)_(test|live)_/)?.[0] ?? (v ? "not a Clerk key" : "empty");

async function clerkUsers(): Promise<Record<Persona, string>> {
  const clerk = createClerkClient({ secretKey });
  const ids = {} as Record<Persona, string>;
  for (const [persona, p] of Object.entries(PERSONAS) as [Persona, (typeof PERSONAS)[Persona]][]) {
    const found = await clerk.users.getUserList({ emailAddress: [p.email] });
    const user =
      found.data[0] ??
      (await clerk.users.createUser({ emailAddress: [p.email], firstName: p.firstName, skipPasswordRequirement: true }));
    ids[persona] = user.id;
  }
  return ids;
}

export async function seed(db: Client, ids: Record<Persona, string>): Promise<E2eState["fixtures"]> {
  const role = { admin: "OPS", podLead: "QC", designer: "DESIGNER", client: "CLIENT", client2: "CLIENT" } as const;
  for (const persona of Object.keys(ids) as Persona[]) {
    await db.query("INSERT INTO users (id, role, status) VALUES ($1, $2, 'ACTIVE')", [ids[persona], role[persona]]);
  }
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1,'SALES'), ($1,'FINANCE')", [ids.admin]);
  await db.query("INSERT INTO staff_profiles (user_id, first_name) VALUES ($1,'Asha'), ($2,'Priya')", [ids.admin, ids.podLead]);

  const pod = (await db.query("INSERT INTO pods (name) VALUES ('Pod One') RETURNING id")).rows[0].id as string;
  await db.query(
    "INSERT INTO pod_members (pod_id, user_id, member_role) VALUES ($1,$2,'POD_LEAD'), ($1,$3,'DESIGNER')",
    [pod, ids.podLead, ids.designer],
  );
  await db.query(
    `INSERT INTO designer_profiles (id, user_id, legal_name, email, agreement_accepted_at, agreement_version)
     VALUES ('dp_e2e', $1, $2, $3, now(), 'v1')`,
    [ids.designer, PERSONAS.designer.legalName, PERSONAS.designer.email],
  );

  // The designer signs the current agreement, as onboarding does: without it
  // they are "not signed up" and cannot be assigned (0009, 0011).
  const agreement = await db.query(
    "SELECT content_sha256 FROM agreement_documents WHERE kind = 'DESIGNER' ORDER BY published_at DESC LIMIT 1",
  );
  await asUser(db, ids.designer, "SELECT public.accept_designer_agreement($1)", [agreement.rows[0].content_sha256]);

  // Clients sign up the way the welcome form does it.
  for (const persona of ["client", "client2"] as const) {
    const p = PERSONAS[persona];
    await asUser(db, ids[persona], "SELECT public.save_client_profile($1,$2,$3,$4)", [p.business, p.legalName, p.email, p.phone]);
    await asUser(db, ids[persona], "SELECT public.save_attribution('google', '{}'::jsonb)");
  }

  // The crawl's jobs: two orders of one client and one of another, all with
  // the same designer, each carrying the client-only labels a designer must
  // never see.
  // Opaque ids, as the app makes them: an id must not say whose order it is.
  async function job(persona: "client" | "client2", reference: string, po: string): Promise<string> {
    const id = generateId();
    await asUser(db, ids[persona], "SELECT public.create_order($1,'RING','USD')", [id]);
    await asUser(
      db,
      ids[persona],
      `SELECT public.upsert_order_spec(p_order_id => $1, p_reference_name => $2, p_product => 'RING',
                                       p_metal => 'YELLOW', p_ring_size => 'US 7')`,
      [id, reference],
    );
    await db.query(
      `UPDATE orders SET status='IN_PROGRESS', category='C', designer_id=$2, pod_id=$3, pod_lead_id=$4, client_po=$5,
                         confirmed_at=now(), paid_at=now()
       WHERE id=$1`,
      [id, ids.designer, pod, ids.podLead, po],
    );
    return id;
  }
  const orders = [
    await job("client", "Mehta anniversary halo", "PO-MEHTA-7781"),
    await job("client", "Kapoor solitaire", "PO-KAPOOR-4410"),
    await job("client2", "Iyer eternity band", "PO-IYER-1203"),
  ];
  const refs = await db.query("SELECT id, order_ref FROM orders WHERE id = ANY($1)", [orders]);
  const codes = await db.query("SELECT user_id, client_code FROM client_accounts WHERE user_id = ANY($1)", [[ids.client, ids.client2]]);
  const profiles = await db.query("SELECT user_id, id FROM client_profiles WHERE user_id = ANY($1)", [[ids.client, ids.client2]]);
  return {
    podId: pod,
    crawlOrders: { sameClient: [orders[0]!, orders[1]!], otherClient: orders[2]! },
    orderRefs: Object.fromEntries(refs.rows.map((r) => [r.id, r.order_ref])),
    clientCodes: Object.fromEntries(codes.rows.map((r) => [r.user_id, r.client_code])),
    clientProfileIds: Object.fromEntries(profiles.rows.map((r) => [r.user_id, r.id])),
  };
}

async function main() {
  for (const [name, value, want] of [
    ["CLERK_SECRET_KEY", secretKey, "sk_test_"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishableKey, "pk_test_"],
  ] as const) {
    if (!value.startsWith(want)) {
      throw new Error(
        `${name} must be a Clerk DEVELOPMENT key starting ${want}; this one is: ${kind(value)}. ` +
          "Live keys are refused. Check the matching E2E_CLERK_* repository secret.",
      );
    }
  }
  // A key copied from the dashboard while it is masked or shortened ("sk_test_ab…")
  // fails deep inside the Clerk client with a header error; say what it is.
  for (const [name, value] of [["CLERK_SECRET_KEY", secretKey], ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishableKey]]) {
    if (!/^[A-Za-z0-9_+/=$-]{20,}$/.test(value!)) {
      throw new Error(`${name} is not a whole key (it has a "…", a space or is too short): copy it again with Clerk's copy button.`);
    }
  }
  assertDestroyable(TEST_DATABASE_URL);
  rmSync(E2E_DIR, { recursive: true, force: true });
  mkdirSync(join(E2E_DIR, "storage"), { recursive: true });

  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await freshSchema(db);
  // PostgREST logs in as `authenticator` and switches to the role in the token.
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authenticator';
    END IF;
  END $$`);
  await db.query("GRANT anon, authenticated, service_role TO authenticator");

  // The anon and service-role keys: signed by a key made for this run only.
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const localJwk = { ...(await exportJWK(publicKey)), kid: "e2e-local", alg: "RS256", use: "sig" };
  const key = (role: string) =>
    new SignJWT({ role, iss: "e2e-local" })
      .setProtectedHeader({ alg: "RS256", kid: "e2e-local" })
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(privateKey);

  const issuer = clerkIssuer(publishableKey);
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`could not read Clerk's signing keys from ${issuer} (${res.status})`);
  const clerkKeys = ((await res.json()) as { keys: object[] }).keys;
  writeFileSync(join(E2E_DIR, "jwks.json"), JSON.stringify({ keys: [...clerkKeys, localJwk] }));

  const ids = await clerkUsers();
  const fixtures = await seed(db, ids);
  await db.end();

  const state: E2eState = {
    anonKey: await key("anon"),
    serviceKey: await key("service_role"),
    clerkIssuer: issuer,
    users: ids,
    fixtures,
  };
  writeFileSync(join(E2E_DIR, "state.json"), JSON.stringify(state, null, 2));
  writeFileSync(
    join(E2E_DIR, "app.env"),
    [
      `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${state.anonKey}`,
      `SUPABASE_SERVICE_ROLE_KEY=${state.serviceKey}`,
      `CLERK_JWT_ISSUER=${issuer}`,
      `CLERK_SECRET_KEY=${secretKey}`,
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${publishableKey}`,
      `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100`,
      "",
    ].join("\n"),
  );
  console.log(`e2e prepared: ${Object.keys(ids).length} Clerk test users, ${fixtures.crawlOrders.sameClient.length + 1} crawl orders`);
}

if (process.argv[1]?.endsWith("prepare.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
