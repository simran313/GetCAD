import { auth } from "@clerk/nextjs/server";
import { CircleCheck } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { redirect } from "next/navigation";

import { paiseToRupees } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { exportPayoutsAction, markBatchPaidAction } from "./actions";
import { Page } from "@/components/ui/page";

/**
 * What we owe designers and pod leads (DECISIONS §5, owner answer Q2).
 *
 * A row appears when an order closes, at the pay locked at quote. In October
 * finance exports owed rows as a batch, pays them by bank transfer from the
 * CSV, and marks the batch paid; each payee is then told. Payees without a
 * usable bank account stay owed until they add one.
 */
export const dynamic = "force-dynamic";

interface PayoutRow {
  obligation_id: string;
  order_id: string;
  order_ref: string | null;
  party: "DESIGNER" | "QC";
  payee_id: string;
  payee_name: string;
  bank_status: string | null;
  amount_paise: number;
  status: "owed" | "exported" | "paid";
  export_batch: string | null;
  created_at: string;
  exported_at: string | null;
  paid_at: string | null;
}

const rupees = (paise: number) => `₹${Number(paiseToRupees(paise)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const sum = (rows: PayoutRow[]) => rows.reduce((s, r) => s + r.amount_paise, 0);
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const small = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

function bankLabel(status: string | null): string {
  if (status === "VERIFIED") return "bank verified";
  if (status === "PENDING_VERIFICATION") return "bank not yet verified";
  if (status === "REJECTED") return "bank rejected";
  return "no bank details";
}

export default async function PayoutsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const { data, error } = await supabase.rpc("payout_list");

  if (error) {
    return (
      <Page>
        <PageHeader title="Payouts" />
        <ErrorPanel title="Not available to your role" message={error.message} />
      </Page>
    );
  }

  const rows = (data ?? []) as PayoutRow[];
  const owed = rows.filter((r) => r.status === "owed");
  const exportable = owed.filter((r) => r.bank_status && r.bank_status !== "REJECTED");
  const batches = new Map<string, PayoutRow[]>();
  for (const r of rows.filter((x) => x.export_batch)) {
    batches.set(r.export_batch!, [...(batches.get(r.export_batch!) ?? []), r]);
  }

  return (
    <Page>
      <PageHeader
        title="Payouts"
        description="Designer and QC pay, owed when an order closes. Export, pay by bank transfer, then mark the batch paid."
      />

      <section className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">Owed</h2>
          <span className="tabular text-[length:var(--fs-4)] font-semibold">{rupees(sum(owed))}</span>
        </div>
        {owed.length === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Nothing owed" description="Pay is added here when an order closes." className="py-8" />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {owed.map((r) => (
              <li key={r.obligation_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-[length:var(--fs-3)]">
                  {r.payee_name} · {r.party === "QC" ? "QC" : "Designer"} ·{" "}
                  <Link href={`/orders/${r.order_id}`} className="font-mono hover:underline">
                    {r.order_ref ?? r.order_id}
                  </Link>
                  <span className={`ml-2 ${small}`}>{bankLabel(r.bank_status)}</span>
                </span>
                <span className="tabular font-medium">{rupees(r.amount_paise)}</span>
              </li>
            ))}
          </ul>
        )}
        {exportable.length > 0 && (
          <form action={exportPayoutsAction} className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              Export {exportable.length} as a batch ({rupees(sum(exportable))})
            </Button>
            {exportable.length < owed.length && (
              <span className={small}>Rows without usable bank details stay owed.</span>
            )}
          </form>
        )}
      </section>

      {[...batches.entries()].map(([batch, items]) => {
        const open = items.some((i) => i.status === "exported");
        return (
          <section
            key={batch}
            className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-[length:var(--fs-3)]">{batch}</h2>
              <span className="tabular font-semibold">{rupees(sum(items))}</span>
            </div>
            <p className={small}>
              {items.length} payment{items.length === 1 ? "" : "s"} ·{" "}
              {open
                ? `exported ${items[0]!.exported_at ? when(items[0]!.exported_at) : ""}, not yet marked paid`
                : `paid ${items[0]!.paid_at ? when(items[0]!.paid_at) : ""}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a href={`/admin/payouts/${batch}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Download CSV
              </a>
              {open && (
                <form action={markBatchPaidAction}>
                  <input type="hidden" name="batch" value={batch} />
                  <Button type="submit" size="sm" variant="secondary">
                    Mark batch paid
                  </Button>
                </form>
              )}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
