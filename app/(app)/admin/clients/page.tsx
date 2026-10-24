import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { when } from "@/lib/work/load";

import { setAccountManagerAction } from "../actions";

/**
 * A9 — clients and their account managers (owner answer, Phase 5d): every
 * client by code, with their orders and spend, and one named team member
 * each. No business-check gate: a new client is never held back from a
 * price. Names stay out; Create order finds a client by name when needed.
 */
export const dynamic = "force-dynamic";

interface ClientRow {
  client_id: string;
  client_code: string | null;
  joined_at: string;
  orders: number;
  open_orders: number;
  paid_cents: number;
  last_order_at: string | null;
  manager_id: string | null;
  manager_name: string | null;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().toUpperCase();
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");

  const res = await supabase.rpc("admin_clients");
  if (res.error) {
    return (
      <main className="container max-w-3xl py-8">
        <PageHeader title="Clients" />
        <ErrorPanel title="Not available to your role" message={res.error.message} className="mt-4" />
      </main>
    );
  }
  const { data: staff } = await supabase.from("staff_profiles").select("user_id, first_name").order("first_name");
  const managers = (staff ?? []) as { user_id: string; first_name: string }[];
  const rows = ((res.data ?? []) as ClientRow[]).filter((r) => !q || (r.client_code ?? "").toUpperCase().includes(q));
  const unassigned = rows.filter((r) => !r.manager_id).length;

  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <PageHeader
        eyebrow="Account managers · one named contact per client"
        title="Clients"
        description={unassigned > 0 ? `${unassigned} client${unassigned === 1 ? "" : "s"} without an account manager.` : undefined}
      />
      <form className="w-full sm:w-72" role="search">
        <Input name="q" defaultValue={rawQ ?? ""} placeholder="Client code" aria-label="Search by client code" />
      </form>
      {rows.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No clients yet.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-[length:var(--fs-2)]">
            <thead className="border-b border-border font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                {["Client", "Orders", "Paid", "Last order", "Account manager"].map((h) => (
                  <th key={h} className="px-[var(--s-4)] py-[var(--s-3)] font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client_id} className="border-b border-border last:border-b-0">
                  <td className="px-[var(--s-4)] py-[var(--s-3)]">
                    <span className="tabular block font-mono text-[length:var(--fs-3)] font-medium">{r.client_code ?? "No code yet"}</span>
                    <span className="text-muted-foreground">joined {when(r.joined_at, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </td>
                  <td className="tabular px-[var(--s-4)] py-[var(--s-3)]">
                    {r.orders}
                    {r.open_orders > 0 && <span className="text-muted-foreground"> · {r.open_orders} open</span>}
                  </td>
                  <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">{formatMoney(Number(r.paid_cents), "USD")}</td>
                  <td className="px-[var(--s-4)] py-[var(--s-3)] text-muted-foreground">{r.last_order_at ? when(r.last_order_at) : "—"}</td>
                  <td className="px-[var(--s-4)] py-[var(--s-3)]">
                    <form action={setAccountManagerAction} className="flex items-center gap-2">
                      <input type="hidden" name="client_id" value={r.client_id} />
                      <Select name="manager_id" defaultValue={r.manager_id ?? ""} aria-label={`Account manager for ${r.client_code ?? "client"}`} className="w-auto">
                        <option value="">Unassigned</option>
                        {managers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.first_name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
