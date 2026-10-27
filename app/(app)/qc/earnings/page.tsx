import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { qcPayoutPaise, rupeesWord } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { EarningsView, type Bank } from "@/components/work/earnings";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadEarnings } from "@/lib/work/load";
import { Page } from "@/components/ui/page";

/** P4 — the pod lead's QC earnings (docs/design; DECISIONS §5). */
export const dynamic = "force-dynamic";

// Example order values for the rate table; the formula is DECISIONS §5.
const EXAMPLES = [30, 55, 60, 85, 120, 180, 240, 320];

export default async function QcEarningsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  try {
    const [rows, bank] = await Promise.all([loadEarnings(supabase), supabase.rpc("my_payout_account")]);
    return (
      <EarningsView
        eyebrow="Paid per review · by order value"
        rows={rows.filter((r) => r.party === "QC")}
        countLabel="reviews"
        rates={EXAMPLES.map((usd) => ({
          key: String(usd),
          label: <span className="font-mono text-[length:var(--fs-2)]">Order ${usd}</span>,
          amount: rupeesWord(qcPayoutPaise(usd * 100)),
        }))}
        rateTitle="QC rate by order value"
        rateNote="₹1,000 for every $60 of the order, rounded to the nearest ₹50, and never less than ₹500. Locked when the order is quoted; paid when it closes."
        bank={(bank.data as Bank | null) ?? null}
      />
    );
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load your earnings" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }
}
