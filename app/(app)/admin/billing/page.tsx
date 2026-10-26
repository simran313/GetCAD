import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { escrowSign, rupeesWord } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { SectionLabel, Stats } from "@/components/work/stats";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { when } from "@/lib/work/load";

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
  HOLD: "Paid · held",
  RELEASE: "Released",
  REFUND: "Refunded",
  PROCESSOR_FEE: "Processor fee",
  CHARGEBACK: "Chargeback",
  REVERSAL: "Reversal",
};

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");

  const ledgerRes = await supabase.rpc("money_ledger", { p_limit: 1000 });
  if (ledgerRes.error) {
    return (
      <main className="container max-w-3xl py-8">
        <PageHeader title="Billing" />
        <ErrorPanel title="Not available to your role" message={ledgerRes.error.message} className="mt-4" />
      </main>
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
    <main className="container max-w-6xl space-y-8 py-8">
      <PageHeader
        eyebrow="Client money and team payouts"
        title="Billing"
        actions={
          <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            Reconcile with Razorpay
          </a>
        }
      />
      <Stats
        items={[
          [formatMoney(held, "USD"), "held in open orders"],
          [formatMoney(paidThisMonth, "USD"), "paid in this month"],
          [formatMoney(refunded, "USD"), "refunded this month"],
          [String(pendingCredits.length), "late credits to decide"],
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <SectionLabel>Money movements · newest first</SectionLabel>
          <Card className="overflow-x-auto">
            {ledger.length === 0 ? (
              <CardBody className="text-[length:var(--fs-3)] text-muted-foreground">No payments yet.</CardBody>
            ) : (
              <table className="w-full text-left text-[length:var(--fs-2)]">
                <thead className="border-b border-border text-[length:var(--fs-2)] text-muted-foreground">
                  <tr>
                    {["Date", "Client", "Order", "Movement", "Amount"].map((h) => (
                      <th key={h} className="px-[var(--s-4)] py-[var(--s-3)] font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 200).map((m) => {
                    let sign = "";
                    try {
                      sign = escrowSign(m.kind) > 0 ? "+" : "−";
                    } catch {
                      sign = "";
                    }
                    return (
                      <tr key={m.id} className="border-b border-border last:border-b-0">
                        <td className="px-[var(--s-4)] py-[var(--s-3)] text-muted-foreground">{when(m.created_at)}</td>
                        <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">{m.client_code ?? "—"}</td>
                        <td className="tabular px-[var(--s-4)] py-[var(--s-3)] font-mono">
                          <Link href={`/orders/${m.order_id}`} className="hover:underline">
                            {m.order_ref ?? "—"}
                          </Link>
                        </td>
                        <td className="px-[var(--s-4)] py-[var(--s-3)]">{KIND_WORDS[m.kind] ?? m.kind}</td>
                        <td className="tabular px-[var(--s-4)] py-[var(--s-3)] text-right font-mono">
                          {sign}
                          {formatMoney(m.amount, m.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team payouts</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[length:var(--fs-3)]">
              <p>
                <span className="tabular font-mono">{rupeesWord(owedPaise)}</span> owed, not yet exported
              </p>
              <p className="text-muted-foreground">
                <span className="tabular font-mono">{rupeesWord(sentPaise)}</span> exported to the bank file
              </p>
              <Link href="/admin/payouts" className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}>
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
              <Link href="/admin/credits" className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}>
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
    </main>
  );
}
