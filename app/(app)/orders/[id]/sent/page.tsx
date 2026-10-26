import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Page } from "@/components/ui/page";

/** N6 — Brief sent: what happens next, one line each (DECISIONS §4, §6, §8). */
export const dynamic = "force-dynamic";

export default async function BriefSentPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.rpc("visible_orders", { p_order_id: id }).select("display_ref").maybeSingle();

  const steps = [
    ["Price", "usually within the hour"],
    ["Pay", "card, Wise, bank or PayPal"],
    ["First look", "within 6 hours of confirming"],
    ["Review", "2 change rounds included"],
  ];

  return (
    <Page form>
      <PageHeader eyebrow={(data as { display_ref?: string } | null)?.display_ref ?? undefined} title="Sent for a price" />
      <ol className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex items-center gap-3 px-[var(--s-4)] py-[var(--s-3)]">
            <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[length:var(--fs-1)] font-semibold">{i + 1}</span>
            <span className="text-[length:var(--fs-3)]">
              <span className="font-medium">{t}</span> <span className="text-muted-foreground">· {d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Link href={`/orders/${id}`} className={buttonVariants()}>
          Open the order
        </Link>
        <Link href="/home" className={buttonVariants({ variant: "ghost" })}>
          Home
        </Link>
      </div>
    </Page>
  );
}
