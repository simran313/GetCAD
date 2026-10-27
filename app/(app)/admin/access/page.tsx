import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { identitiesFor, type Identity } from "@/lib/clerk/identities";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { AccessTable, type AccessRow } from "./AccessTable";

/**
 * Access control — who is on the platform and what they may do.
 *
 * Before this, the only way to make someone OPS was an UPDATE in the Supabase
 * SQL editor. That is fine for the first account and wrong for every one after
 * it: no record of who granted what, and the most privilege-sensitive action in
 * the product happening in a tool that will just as happily drop a table.
 *
 * WHO IS WHO, FOR ADMINS ONLY. An admin (Sales + Ops + Finance, DECISIONS §2)
 * also sees each account's email and name, fetched from Clerk, and can search
 * by them. public.record_identity_lookup() is asked first: it refuses anyone
 * who is not an admin and writes the lookup to the audit log as an
 * identity-piercing read (0038). A plain OPS account sees references only, as
 * before.
 *
 * The redesign (A4) moves the list into AccessTable: tabs with counts and
 * instant search over the rows below, so the page loads every account once.
 *
 * The order counts are there so nobody flips a role blind. A designer with live
 * work is not someone to move to CLIENT without thinking about what happens to
 * those orders.
 */
export const dynamic = "force-dynamic";

interface PlatformUser {
  id: string;
  role: string;
  status: string;
  created_at: string;
  orders_as_client: number;
  orders_as_designer: number;
  reference: string | null;
  reviews: number;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TAB_OF: Record<string, string> = { CLIENT: "clients", DESIGNER: "designers", QC: "leads", OPS: "admins" };

function activity(u: PlatformUser): string {
  if (u.role === "CLIENT") return u.orders_as_client ? count(u.orders_as_client, "order") : "No orders yet";
  if (u.role === "DESIGNER") return u.orders_as_designer ? count(u.orders_as_designer, "job") : "No jobs yet";
  return u.reviews ? count(u.reviews, "review") : "—";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { q, role: roleFilter } = await searchParams;

  const supabase = await createUserSupabaseClient();

  // An empty lookup records nothing but still runs the admin check, so this
  // is how the page learns whether it may show identities at all.
  const { error: notAdmin } = await supabase.rpc("record_identity_lookup", {
    p_user_ids: [],
    p_purpose: "access screen",
  });
  const isAdmin = !notAdmin;

  // Every account, once: the tabs and the search filter in the browser.
  const { data, error } = await supabase.rpc("list_platform_users", { p_search: null, p_role: null });

  // The database refuses non-OPS callers. Rendering its message rather than a
  // generic "forbidden" means a SALES member reading this knows why, and knows
  // it is not a bug.
  if (error) {
    return (
      <Page>
        <PageHeader title="Access" />
        <ErrorPanel title="Not available to your role" message={error.message} />
        <Link href="/admin" className={buttonVariants({ variant: "secondary" })}>
          Back to the queue
        </Link>
      </Page>
    );
  }

  const users = (data ?? []) as PlatformUser[];
  let identities = new Map<string, Identity>();
  let identityError: string | null = null;

  if (isAdmin) {
    try {
      const ids = users.map((u) => u.id);
      const { error: lookupError } = await supabase.rpc("record_identity_lookup", {
        p_user_ids: ids,
        p_purpose: "access screen",
      });
      if (lookupError) throw new Error(lookupError.message);
      identities = await identitiesFor(ids);
    } catch (e) {
      identityError = e instanceof Error ? e.message : "Clerk did not answer";
    }
  }

  // Extra staff roles (0033), so an admin shows as Ops + Sales + Finance
  // rather than just their primary role. OPS may read every grant.
  const { data: grantRows } = await supabase.from("user_roles").select("user_id, role");
  const extraRoles = new Map<string, string[]>();
  for (const g of (grantRows ?? []) as { user_id: string; role: string }[]) {
    extraRoles.set(g.user_id, [...(extraRoles.get(g.user_id) ?? []), g.role]);
  }

  const rows: AccessRow[] = users.map((u) => {
    const who = identities.get(u.id);
    return {
      id: u.id,
      reference: u.reference,
      email: who?.email ?? null,
      name: who?.name ?? null,
      role: u.role,
      extraRoles: (extraRoles.get(u.id) ?? []).filter((r) => r !== u.role),
      status: u.status,
      activity: activity(u),
      you: u.id === userId,
    };
  });

  return (
    <Page>
      <PageHeader
        title="Access"
        description="Who is on the platform and what each person may do. A change takes effect on their next page load."
        actions={
          <Link href="/admin/access/pods" className={buttonVariants({ variant: "secondary" })}>
            Pods
          </Link>
        }
      />

      {identityError && <ErrorPanel title="Couldn't load emails" message={`${identityError} — showing account references only.`} />}

      <AccessTable
        rows={rows}
        initialQuery={q ?? ""}
        initialTab={roleFilter ? (TAB_OF[roleFilter] ?? "all") : "all"}
        searchHint={isAdmin ? "Email, name or reference" : "Reference (ACC, DSG)"}
      />

      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        Every change is written to the audit log with the account that made it. The last active Ops account cannot be demoted or
        suspended; promote someone else first.{isAdmin ? " Showing emails is recorded in the audit log too." : ""}
      </p>
    </Page>
  );
}
