import { CircleCheck } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { decideCreditAction } from "./actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";

/**
 * Late-order credits waiting for a decision (DECISIONS §6, owner answer Q4).
 *
 * When a standard order misses its 6-hour first look, the sweep creates one
 * pending credit for the amount paid. Nothing reaches the client until an
 * admin decides it here: apply to the next order, refund, a partial credit
 * (with a reason) or reject (with a reason). A refund is recorded here and
 * sent by hand until the payment providers are connected (Phase 9).
 */
export const dynamic = "force-dynamic";

interface PendingCredit {
  credit_id: string;
  order_id: string;
  order_ref: string | null;
  client_code: string | null;
  amount_cents: number;
  currency: string;
  due_at: string | null;
  created_at: string;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export default async function CreditsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const { data, error } = await supabase.rpc("pending_sla_credits");

  if (error) {
    return (
      <Page>
        <h1 className="text-[length:var(--fs-6)] font-semibold tracking-[var(--ls-6)]">Late-order credits</h1>
        <ErrorPanel title="Not available to your role" message={error.message} className="mt-4" />
      </Page>
    );
  }

  const credits = (data ?? []) as PendingCredit[];

  return (
    <Page>
      <PageHeader
        eyebrow="First look missed"
        title="Late-order credits"
        description="Standard orders that missed the 6-hour first look. The client sees nothing until you decide."
      />

      <div className="mt-6 overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {credits.length === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Nothing to decide" description="Every first look so far was on time, or already credited." />
        ) : (
          <ul className="divide-y divide-border">
            {credits.map((c) => (
              <li key={c.credit_id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/orders/${c.order_id}`} className="font-mono text-[length:var(--fs-3)] hover:underline">
                    {c.order_ref ?? c.order_id}
                  </Link>
                  <span className="tabular font-mono text-[length:var(--fs-4)]">
                    {formatMoney(c.amount_cents, c.currency)}
                  </span>
                </div>
                <p className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">
                  {c.client_code ? `Client ${c.client_code} · ` : ""}
                  {c.due_at ? `was due ${when(c.due_at)}` : ""}
                </p>
                <form action={decideCreditAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="credit_id" value={c.credit_id} />
                  <label className="text-[length:var(--fs-2)] text-muted-foreground">
                    Decision
                    <Select name="decision" defaultValue="apply_next" className="mt-0.5 w-auto">
                      <option value="apply_next">Apply to next order</option>
                      <option value="refunded">Refund</option>
                      <option value="partial">Partial credit</option>
                      <option value="rejected">Reject</option>
                    </Select>
                  </label>
                  <label className="text-[length:var(--fs-2)] text-muted-foreground">
                    Amount $ (partial)
                    <Input name="amount_usd" type="number" min="0.01" step="0.01" className="mt-0.5 w-28" />
                  </label>
                  <label className="text-[length:var(--fs-2)] text-muted-foreground">
                    Reason (partial / reject)
                    <Input name="reason" maxLength={1000} className="mt-0.5 w-full sm:w-64" />
                  </label>
                  <Button type="submit" size="sm" variant="secondary">
                    Decide
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
