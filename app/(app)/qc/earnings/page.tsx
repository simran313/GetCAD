import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { podPayPaise, rupeesWord } from "@/core";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ErrorPanel } from "@/components/error-panel";
import { EarningsView, type Bank } from "@/components/work/earnings";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadEarnings } from "@/lib/work/load";
import { minutesLabel } from "@/lib/work/minutes";
import { Page } from "@/components/ui/page";

/**
 * P4 — the pod lead's earnings (docs/design; DECISIONS §5 as of 0065). Pod pay
 * is a share of the designer's pay on the job, never worked from the order's
 * price, which a pod lead does not see.
 */
export const dynamic = "force-dynamic";

export default async function QcEarningsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  try {
    const [rows, bank, cats, settings] = await Promise.all([
      loadEarnings(supabase),
      supabase.rpc("my_payout_account"),
      supabase.from("job_categories").select("letter, minutes").order("letter"),
      supabase.from("app_settings").select("key, value").in("key", ["designer_rate_paise_per_minute", "pod_share_pct", "pod_min_paise"]),
    ]);
    const s = new Map(((settings.data ?? []) as { key: string; value: number | null }[]).map((r) => [r.key, r.value]));
    const perMinute = s.get("designer_rate_paise_per_minute") ?? 800;
    const share = s.get("pod_share_pct") ?? 50;
    const floor = s.get("pod_min_paise") ?? 30000;
    const rates = ((cats.data ?? []) as { letter: string; minutes: number }[]).map((c) => ({
      key: c.letter,
      label: (
        <>
          <CategoryBadge letter={c.letter} />
          <span className="text-[length:var(--fs-2)] text-muted-foreground">{minutesLabel(c.minutes)}</span>
        </>
      ),
      amount: rupeesWord(podPayPaise(c.minutes * perMinute, share, floor)),
    }));
    return (
      <EarningsView
        eyebrow={`Paid per review · ${share}% of the designer's pay, at least ${rupeesWord(floor)}`}
        rows={rows.filter((r) => r.party === "QC")}
        countLabel="reviews"
        rates={rates}
        rateTitle="Pod pay by category"
        rateNote={`${share}% of what the job pays its designer, never less than ${rupeesWord(floor)}. Shown at the standard designer rate; a designer on their own rate moves it. Set when the designer is assigned; paid when the order closes.`}
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
