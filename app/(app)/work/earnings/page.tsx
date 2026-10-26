import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { rupeesWord } from "@/core";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ErrorPanel } from "@/components/error-panel";
import { EarningsView, type Bank } from "@/components/work/earnings";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadEarnings } from "@/lib/work/load";
import { Page } from "@/components/ui/page";
import { minutesLabel } from "@/lib/work/minutes";

/** D6 — the designer's earnings and bank (docs/design). */
export const dynamic = "force-dynamic";

export default async function DesignerEarningsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  try {
    const [rows, cats, bank] = await Promise.all([
      loadEarnings(supabase),
      supabase.from("job_categories").select("letter, minutes, designer_rate_paise").order("letter"),
      supabase.rpc("my_payout_account"),
    ]);
    const rates = ((cats.data ?? []) as { letter: string; minutes: number; designer_rate_paise: number }[]).map((c) => ({
      key: c.letter,
      label: (
        <>
          <CategoryBadge letter={c.letter} />
          <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(c.minutes)}</span>
        </>
      ),
      amount: rupeesWord(c.designer_rate_paise),
    }));
    return (
      <EarningsView
        eyebrow="Paid per job · ₹500 per hour of category time"
        rows={rows.filter((r) => r.party === "DESIGNER")}
        rates={rates}
        rateTitle="Your rate card"
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
