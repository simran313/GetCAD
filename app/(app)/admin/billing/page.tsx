import { auth } from "@clerk/nextjs/server";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { escrowSign, rupeesWord, formatDay } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { SectionLabel, Stats } from "@/components/work/stats";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { viewerZone } from "@/lib/time/zone";

/**
 * A8 — Billing, as a money overview (owner answer, Phase 5d): what clients
 * paid, what is held in open orders, refunds, late-order credits and what
 * designers and pod leads are owed. Numbered invoices and wallet balances
 * come with the payment providers (Phase 9); wallet top-ups are off.
 */
export const dynamic = "force-dynamic";

interface Movement {
  id: string;
  order_id: string;
  order_ref: string | null;
  client_code: string | null;
  kind: string;
  amount: number;
  currency: string;
  created_at: string;
}

const KIND_WORDS: Record<string, string> = {
  HOLD: "Paid",
  RELEASE: "Released",
  REFUND: "Refunded",
  PROCESSOR_FEE: "Processor fee",
  CHARGEBACK: "Chargeback",
  REVERSAL: "Reversal",
};

const signOf = (kind: string) => {
  try {
    return escrowSign(kind) > 0 ? "+" : "−";
  } catch {
    return "";
  }
};

const movementColumns = (tz: string): Column<Movement>[] => [
  { key: "date", header: "Date", className: "whitespace-nowrap text-[length:var(--fs-2)] text-muted-foreground", cell: (m) => formatDay(m.created_at, tz) },
  {
    key: "order",
    header: "Order",
    card: "title",
    cell: (m) => (
      <span className="block min-w-0">
        <span className="tabular block font-mono">{m.order_ref ?? "—"}</span>
        <span className="tabular block font-mono text-[length:var(--fs-2)] font-normal text-muted-foreground">{m.client_code ?? "—"}</span>
      </span>
    ),
  },
  { key: "kind", header: "Movement", card: "badge", className: "whitespace-nowrap", cell: (m) => KIND_WORDS[m.kind] ?? m.kind },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    className: "tabular whitespace-nowrap font-mono",
    cell: (m) => `${signOf(m.kind)}${formatMoney(m.amount, m.currency)}`,
  },
];

export default async function BillingPage() {
  const { userId } = await auth();
  const tz = await viewerZone();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();

  const ledgerRes = await supabase.rpc("money_ledger", { p_limit: 1000 });
  if (ledgerRes.error) {
    return (
      <Page>
        <PageHeader title="Billing" />
        <ErrorPanel title="Not available to your role" message={ledgerRes.error.message} className="mt-4" />
      </Page>
    );
  }
  const [creditsRes, owedRes] = await Promise.all([
    supabase.from("client_credits").select("status, amount_cents, decided_amount_cents"),
    supabase.from("payout_obligations").select("status, amount_paise"),
  ]);
  const ledger = (ledgerRes.data ?? []) as Movement[];
  const credits = (creditsRes.data ?? []) as { status: string; amount_cents: number; decided_amount_cents: number | null }[];
  const owed = (owedRes.data ?? []) as { status: string; amount_paise: number }[];

  const usd = ledger.filter((m) => m.currency === "USD");
  const byOrder = new Map<string, number>();
  for (const m of usd) {
    try {
      byOrder.set(m.order_id, (byOrder.get(m.order_id) ?? 0) + escrowSign(m.kind) * m.amount);
    } catch {
      // An unknown kind is shown in the ledger but not guessed into a balance.
    }
  }
  const held = [...byOrder.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const month = new Date().toISOString().slice(0, 7);
  const paidThisMonth = usd.filter((m) => m.kind === "HOLD" && m.created_at.startsWith(month)).reduce((s, m) => s + m.amount, 0);
  const refunded = usd.filter((m) => m.kind === "REFUND" && m.created_at.startsWith(month)).reduce((s, m) => s + m.amount, 0);
  const pendingCredits = credits.filter((c) => c.status === "pending");
  const owedPaise = owed.filter((o) => o.status === "owed").reduce((s, o) => s + o.amount_paise, 0);
  const sentPaise = owed.filter((o) => o.status === "exported").reduce((s, o) => s + o.amount_paise, 0);

  return (
    <Page>
      <PageHeader
        title="Billing"
        description="Client money in, team payouts out, and late-order credits."
        actions={
          <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
            Reconcile with Razorpay
          </a>
        }
      />
      <Stats
        items={[
          [formatMoney(held, "USD"), "paid on open orders"],
          [formatMoney(paidThisMonth, "USD"), "paid in this month"],
          [formatMoney(refunded, "USD"), "refunded this month"],
          [String(pendingCredits.length), "late credits to decide"],
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <SectionLabel>Money movements · newest first</SectionLabel>
          <ResponsiveDataList
            caption="Money movements"
            columns={movementColumns(tz)}
            rows={ledger.slice(0, 200)}
            rowKey={(m) => m.id}
            rowHref={(m) => `/orders/${m.order_id}`}
            linkKey="order"
            empty={
              <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
                <EmptyState icon={<Wallet />} title="No payments yet" description="Card payments and transfers you mark received appear here." />
              </div>
            }
          />
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team payouts</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[length:var(--fs-3)]">
              <p>
                <span className="tabular font-semibold">{rupeesWord(owedPaise)}</span> owed, not yet exported
              </p>
              <p className="text-muted-foreground">
                <span className="tabular font-semibold">{rupeesWord(sentPaise)}</span> exported to the bank file
              </p>
              <Link href="/admin/payouts" className={`${buttonVariants({ variant: "secondary", size: "sm" })} w-full`}>
                Payouts
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Late-order credits</CardTitle>
              {pendingCredits.length > 0 && <StatusTag kind="needs">{pendingCredits.length} to decide</StatusTag>}
            </CardHeader>
            <CardBody className="space-y-2 text-[length:var(--fs-3)]">
              <p className="text-muted-foreground">
                {formatMoney(pendingCredits.reduce((s, c) => s + c.amount_cents, 0), "USD")} waiting for a decision.
              </p>
              <Link href="/admin/credits" className={`${buttonVariants({ variant: "secondary", size: "sm" })} w-full`}>
                Credits
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-[length:var(--fs-2)] text-muted-foreground">
              Numbered invoices and client wallets arrive with the payment providers. Until then, send an invoice from your
              accounting tool and mark Wise, bank or PayPal payments received on the order.
            </CardBody>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
