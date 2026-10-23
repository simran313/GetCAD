import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { partyLabel } from "@/components/domain";
import { ErrorPanel } from "@/components/error-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { identitiesFor, searchIdentities, type Identity } from "@/lib/clerk/identities";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { setUserRoleAction, setUserStatusAction } from "./actions";
import { Select } from "@/components/ui/select";

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
 * The order counts are there so nobody flips a role blind. A designer with live
 * work is not someone to move to CLIENT without thinking about what happens to
 * those orders.
 */
export const dynamic = "force-dynamic";

const ROLES = ["CLIENT", "DESIGNER", "OPS", "SALES", "FINANCE", "QC"] as const;

interface PlatformUser {
  id: string;
  role: string;
  status: string;
  created_at: string;
  orders_as_client: number;
  orders_as_designer: number;
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
  await supabase.rpc("ensure_self");

  // An empty lookup records nothing but still runs the admin check, so this
  // is how the page learns whether it may show identities at all.
  const { error: notAdmin } = await supabase.rpc("record_identity_lookup", {
    p_user_ids: [],
    p_purpose: "access screen",
  });
  const isAdmin = !notAdmin;
  const search = q?.trim() || null;

  const { data, error } = await supabase.rpc("list_platform_users", {
    // An admin's search also matches email and name, so it filters below
    // instead of in the database (which only knows ids).
    p_search: isAdmin ? null : search,
    p_role: roleFilter && roleFilter !== "ALL" ? roleFilter : null,
  });

  // The database refuses non-OPS callers. Rendering its message rather than a
  // generic "forbidden" means a SALES member reading this knows why, and knows
  // it is not a bug.
  if (error) {
    return (
      <main className="container max-w-3xl py-8">
        <h1 className="text-[length:var(--fs-6)] font-semibold tracking-[var(--ls-6)]">Access</h1>
        <ErrorPanel title="Not available to your role" message={error.message} className="mt-4" />
        <Link href="/admin" className="mt-4 inline-block text-[length:var(--fs-3)] leading-[var(--lh-3)] text-primary hover:underline">
          Back to the queue
        </Link>
      </main>
    );
  }

  let users = (data ?? []) as PlatformUser[];
  let identities = new Map<string, Identity>();
  let identityError: string | null = null;

  if (isAdmin) {
    try {
      if (search) {
        const matches = new Set(await searchIdentities(search));
        const needle = search.toLowerCase();
        users = users.filter((u) => matches.has(u.id) || u.id.toLowerCase().includes(needle));
      }
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

  return (
    <main className="container max-w-4xl py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[length:var(--fs-6)] font-semibold leading-[var(--lh-6)] tracking-[var(--ls-6)]">
          Access
        </h1>
        <Link href="/admin" className="text-[length:var(--fs-3)] leading-[var(--lh-3)] text-primary hover:underline">
          Back to the queue
        </Link>
      </div>
      <p className="mt-2 text-[length:var(--fs-4)] leading-[var(--lh-4)] text-muted-foreground">
        Every account on the platform. Roles decide what each person sees; the database enforces it
        either way, so a change here takes effect on their next page load.
      </p>

      {/* GET, not a Server Action: a filter belongs in the URL so it can be
          bookmarked, shared with another staff member, and survives a refresh. */}
      <form method="GET" className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={isAdmin ? "Email, name or account reference…" : "Account reference…"}
          aria-label={isAdmin ? "Search by email, name or account reference" : "Search by account reference"}
          className="max-w-xs"
        />
        <Select
          name="role"
          defaultValue={roleFilter ?? "ALL"}
          aria-label="Filter by role"
          className="w-auto"
        >
          <option value="ALL">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {partyLabel(r)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {identityError && (
        <ErrorPanel
          title="Couldn't load emails"
          message={`${identityError} — showing account references only.`}
          className="mt-4"
        />
      )}

      <div className="mt-6 overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {users.length === 0 ? (
          <p className="p-6 text-center text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            No accounts match. {q ? "Try a shorter reference." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const who = identities.get(u.id);
              return (
              <li key={u.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {who?.email ? (
                      <p className="break-all text-[length:var(--fs-4)] font-medium leading-[var(--lh-4)]">
                        {who.email}
                        {who.name ? (
                          <span className="ml-2 font-normal text-muted-foreground">{who.name}</span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="tabular break-all font-mono text-[length:var(--fs-2)] text-muted-foreground">
                      {u.id}
                      {u.id === userId ? (
                        <span className="ml-2 font-sans not-italic text-foreground">(you)</span>
                      ) : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{partyLabel(u.role)}</Badge>
                      {(extraRoles.get(u.id) ?? []).map((r) => (
                        <Badge key={r} variant="muted">
                          + {partyLabel(r)}
                        </Badge>
                      ))}
                      <Badge variant={u.status === "ACTIVE" ? "default" : "muted"}>
                        {u.status === "ACTIVE"
                          ? "Active"
                          : u.status === "SUSPENDED"
                            ? "Suspended"
                            : "Pending"}
                      </Badge>
                      <span className="text-[length:var(--fs-2)] text-muted-foreground">
                        {u.orders_as_client} placed · {u.orders_as_designer} worked
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setUserRoleAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="user_id" value={u.id} />
                      <Select
                        name="role"
                        defaultValue={u.role}
                        aria-label={`Role for ${u.id}`}
                        className="w-auto"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {partyLabel(r)}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="outline" size="sm">
                        Set role
                      </Button>
                    </form>

                    {/* Suspend, never delete: orders, escrow rows and audit
                        entries reference this account, and a platform that can
                        erase a counterparty cannot answer a dispute. */}
                    <form action={setUserStatusAction}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}
                      />
                      <Button
                        type="submit"
                        variant={u.status === "SUSPENDED" ? "outline" : "destructive"}
                        size="sm"
                      >
                        {u.status === "SUSPENDED" ? "Reinstate" : "Suspend"}
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[length:var(--fs-2)] text-muted-foreground">
        Every change is written to the audit log with the account that made it. The last active OPS
        account cannot be demoted or suspended — promote someone else first.
        {isAdmin ? " Showing emails is recorded in the audit log too." : ""}
      </p>
    </main>
  );
}
