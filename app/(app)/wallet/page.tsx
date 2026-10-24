import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { Lines } from "./Lines";
import { loadWallet } from "./load";
import { WalletNav } from "./WalletNav";

/** W1 — Wallet (docs/design), read-only until wallet payments arrive. */
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const w = await loadWallet(supabase);

  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <PageHeader title="Wallet" />
      <WalletNav active="/wallet" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-2)] text-muted-foreground">Credit</p>
            <p className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{formatMoney(w.creditCents, "USD")}</p>
            <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">Taken off your next order&apos;s price by the team.</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-2)] text-muted-foreground">Held in orders · released after you approve</p>
            <p className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{formatMoney(w.heldCents, "USD")}</p>
            <p className="mt-1 truncate text-[length:var(--fs-2)] text-muted-foreground">
              {w.heldOrders.map((o) => o.title).join(" · ") || "Nothing held"}
            </p>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add funds</CardTitle>
        </CardHeader>
        <CardBody className="text-[length:var(--fs-2)] text-muted-foreground">
          Topping up and paying from your wallet are coming with our next payment options. Until then, pay each order from its Pay
          screen, or <Link href="/messages" className="underline underline-offset-4">message the team</Link>.
        </CardBody>
      </Card>
      <h2 className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">Activity</h2>
      <Lines lines={w.lines.slice(0, 5)} />
    </main>
  );
}
