import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { EarningsView, type Bank } from "@/components/work/earnings";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadEarnings } from "@/lib/work/load";
import { Page } from "@/components/ui/page";

/**
 * D6 — the designer's earnings and bank (docs/design). Each job's pay, and
 * no rate card: a designer sees what each job pays, never a rate (owner,
 * 7 Nov 2026; the category table is closed to designers by policies 0048).
 */
export const dynamic = "force-dynamic";

export default async function DesignerEarningsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  try {
    const [rows, bank] = await Promise.all([loadEarnings(supabase), supabase.rpc("my_payout_account")]);
    return (
      <EarningsView
        eyebrow="Paid per job · each job shows its pay before you start"
        rows={rows.filter((r) => r.party === "DESIGNER")}
        rateNote="QC send-backs are part of the job. Client-requested changes after approval are paid as a new job at their own category."
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
