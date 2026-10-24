import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { Lines } from "../Lines";
import { loadWallet } from "../load";
import { WalletNav } from "../WalletNav";

/** W2 — Transactions (docs/design): every payment, hold, refund and credit. */
export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const w = await loadWallet(supabase);
  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <PageHeader title="Transactions" />
      <WalletNav active="/wallet/transactions" />
      <Lines lines={w.lines} />
    </main>
  );
}
