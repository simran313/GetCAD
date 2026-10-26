import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { loadWallet } from "../load";
import { WalletNav } from "../WalletNav";
import { Page } from "@/components/ui/page";

/**
 * W3 — Invoices (docs/design): every paid order with its amount and date.
 * Downloadable invoice PDFs come with the payment providers (Phase 9); the
 * team can send one on request meanwhile.
 */
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const w = await loadWallet(supabase);
  return (
    <Page>
      <PageHeader title="Invoices" description="Need a formal invoice? Message the team from the order and we will send it." />
      <WalletNav active="/wallet/invoices" />
      {w.paidOrders.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No paid orders yet.</Card>
      ) : (
        <Card>
          <ul>
            {w.paidOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0">
                <span className="min-w-0">
                  <Link href={`/orders/${o.id}`} className="block text-[length:var(--fs-3)] hover:underline">
                    {o.title}
                  </Link>
                  <span className="tabular block font-mono text-[length:var(--fs-2)] text-muted-foreground">
                    {o.display_ref} · paid {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(o.paid_at!))}
                  </span>
                </span>
                <span className="tabular font-mono text-[length:var(--fs-3)]">
                  {o.price_total ? formatMoney(o.price_total, o.currency ?? "USD") : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
