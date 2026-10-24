import Link from "next/link";

import { minutesWord, rupeesWord } from "@/core";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { SectionLabel, Stats } from "@/components/work/stats";
import { productWord } from "@/lib/client/orders";
import { when, type Earning } from "@/lib/work/load";

/**
 * D6 / P4 — earnings (docs/design). What the caller is owed and was paid,
 * per job (payout_obligations, created when an order closes), the rate
 * table and their bank account. In October payouts go out by bank transfer
 * from the finance export, so "on its way" means exported to the bank file.
 */
const STATE: Record<Earning["status"], { word: string; kind: "active" | "done" | "muted" }> = {
  owed: { word: "Owed", kind: "muted" },
  exported: { word: "On its way", kind: "active" },
  paid: { word: "Paid", kind: "done" },
};

export interface Bank {
  beneficiary_name: string;
  account_last4: string;
  ifsc: string;
  account_type: string;
  status: string;
}

export function EarningsView({
  eyebrow,
  rows,
  rates,
  rateTitle,
  rateNote,
  bank,
  countLabel,
}: {
  eyebrow: string;
  rows: Earning[];
  rates: { key: string; label: React.ReactNode; amount: string }[];
  rateTitle: string;
  rateNote: string;
  bank: Bank | null;
  countLabel?: string;
}) {
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => r.created_at.startsWith(month));
  const sum = (rs: Earning[]) => rs.reduce((s, r) => s + r.amount_paise, 0);
  const stats: [string, string][] = [
    [rupeesWord(sum(thisMonth)), "earned this month"],
    ...(countLabel ? ([[String(thisMonth.length), countLabel]] as [string, string][]) : []),
    [rupeesWord(sum(rows.filter((r) => r.status === "exported"))), "on its way"],
    [rupeesWord(sum(rows.filter((r) => r.status === "owed"))), "owed, not yet sent"],
  ];
  return (
    <main className="container max-w-5xl space-y-8 py-8">
      <PageHeader eyebrow={eyebrow} title="Earnings" />
      <Stats items={stats} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <SectionLabel>Paid per job, after the order closes</SectionLabel>
          <Card>
            {rows.length === 0 ? (
              <CardBody className="text-[length:var(--fs-3)] text-muted-foreground">
                Nothing yet. Each job is added here when its order closes.
              </CardBody>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li
                    key={r.obligation_id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0 sm:grid-cols-[7rem_1fr_auto_auto_auto]"
                  >
                    <span className="text-[length:var(--fs-2)] text-muted-foreground">{when(r.created_at)}</span>
                    <span className="min-w-0 sm:order-none">
                      <span className="block truncate text-[length:var(--fs-3)]">{productWord(r.product)}</span>
                      <span className="tabular block font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                        {r.display_ref}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <CategoryBadge letter={r.category} />
                      <span className="font-mono text-[length:var(--fs-1)]">{minutesWord(r.minutes)}</span>
                    </span>
                    <span className="tabular font-mono text-[length:var(--fs-3)]">{rupeesWord(r.amount_paise)}</span>
                    <StatusTag kind={STATE[r.status].kind}>{STATE[r.status].word}</StatusTag>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-[length:var(--fs-2)] text-muted-foreground">{rateNote}</p>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{rateTitle}</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="divide-y divide-border">
                {rates.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3 py-[var(--s-2)] text-[length:var(--fs-2)]">
                    <dt className="flex items-center gap-2">{r.label}</dt>
                    <dd className="tabular font-mono">{r.amount}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2">
              {bank ? (
                <>
                  <p className="text-[length:var(--fs-3)] font-medium">
                    {bank.beneficiary_name} ····{bank.account_last4}
                  </p>
                  <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                    {bank.account_type} · IFSC {bank.ifsc}
                  </p>
                  <StatusTag kind={bank.status === "VERIFIED" ? "done" : bank.status === "REJECTED" ? "needs" : "muted"}>
                    {bank.status === "VERIFIED" ? "Verified" : bank.status === "REJECTED" ? "Needs fixing" : "Being checked"}
                  </StatusTag>
                </>
              ) : (
                <p className="text-[length:var(--fs-3)]">No bank account yet. Add one to be paid.</p>
              )}
              <Link href="/settings/payouts" className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}>
                {bank ? "Update bank details" : "Add bank details"}
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </main>
  );
}
