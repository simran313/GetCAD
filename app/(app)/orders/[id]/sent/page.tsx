import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Page } from "@/components/ui/page";

/** N6 — Brief sent (docs/design): what happens next, in DECISIONS' words. */
export const dynamic = "force-dynamic";

export default async function BriefSentPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.rpc("visible_orders", { p_order_id: id }).select("display_ref").maybeSingle();

  const steps = [
    ["Price", "We price it from the category bands, usually within the hour."],
    ["Pay", "Pay by card here, or by Wise, bank transfer or PayPal — message us for details."],
    ["Confirm", "We confirm the brief. Your first look is due within 6 hours of that, or it's free."],
    ["Review", "Approve the renders or ask for changes: two rounds are included."],
  ];

  return (
    <Page form>
      <PageHeader
        eyebrow={(data as { display_ref?: string } | null)?.display_ref ?? "Order"}
        title="Brief sent"
        description="Thank you. Here is what happens next."
      />
      <Card>
        <CardBody>
          <ol className="space-y-4">
            {steps.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="font-mono text-[length:var(--fs-2)] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[length:var(--fs-4)] font-medium">{t}</span>
                  <span className="text-[length:var(--fs-3)] text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link href={`/orders/${id}`} className={buttonVariants()}>
          Open the order
        </Link>
        <Link href="/home" className={buttonVariants({ variant: "outline" })}>
          Go to home
        </Link>
      </div>
    </Page>
  );
}
