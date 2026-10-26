import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { Lines } from "../Lines";
import { loadWallet } from "../load";
import { WalletNav } from "../WalletNav";
import { Page } from "@/components/ui/page";

/** W2 — Transactions (docs/design): every payment, hold, refund and credit. */
export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const w = await loadWallet(supabase);
  return (
    <Page>
      <PageHeader title="Transactions" />
      <WalletNav active="/wallet/transactions" />
      <Lines lines={w.lines} />
    </Page>
  );
}
