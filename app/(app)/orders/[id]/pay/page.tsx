import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PageHeader } from "@/components/ui/page-header";
import { productWord, serviceWord } from "@/lib/client/orders";
import { formatMoney } from "@/lib/money";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { transitionAction } from "../../actions";
import { PayButton } from "../../PayButton";
import { Page } from "@/components/ui/page";

/**
 * C5 — Pay (docs/design). The price and what it buys, card payment through
 * Razorpay, and for Wise, bank transfer or PayPal a message to the team, who
 * mark it paid when it arrives (owner answer, Phase 5b). Rush and wallet
 * checkout stay off (DECISIONS §12). The amount always comes from the order.
 */
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const supabase = await createUserSupabaseClient();
  const { data } = await supabase
    .rpc("visible_orders", { p_order_id: id })
    .select("id, relation, status, display_ref, product_type, service, category, tier, complex_deadline_hours, price_total, currency")
    .maybeSingle();
  const o = data as {
    id: string;
    relation: string;
    status: string;
    display_ref: string | null;
    product_type: string;
    service: string;
    category: string | null;
    tier: string | null;
    complex_deadline_hours: number | null;
    price_total: number | null;
    currency: string | null;
  } | null;
  if (!o || o.relation !== "CLIENT") redirect(`/orders/${id}`);
  if (o.status !== "QUOTED" || !o.price_total) redirect(`/orders/${id}`);

  const { data: spec } = await supabase.from("order_specs").select("reference_name, product").eq("order_id", id).maybeSingle();
  const title = (spec as { reference_name?: string } | null)?.reference_name || productWord(o.product_type);
  const price = formatMoney(o.price_total, o.currency ?? "USD");
  const promise =
    o.tier === "complex"
      ? `Complex piece: first look within ${o.complex_deadline_hours ?? "the agreed"} hours of order confirmation.`
      : "First look within 6 hours of order confirmation, or the full price comes back to you as credit and we still finish it.";

  return (
    <Page>
      <PageHeader eyebrow={`Order · ${o.display_ref ?? ""}`} title={`Pay ${price}`} description={title} />

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>What you get</CardTitle>
            <CategoryBadge letter={o.category} />
          </CardHeader>
          <CardBody className="space-y-3 text-[length:var(--fs-3)]">
            <p>{serviceWord(o.service)} · {productWord((spec as { product?: string } | null)?.product ?? o.product_type)}</p>
            <p className="text-muted-foreground">
              {o.service === "render" ? "Rendered views to approve." : "Renders to approve, then STL, 3DM and a summary sheet."} Two
              rounds of changes are included within 14 days of your first look.
            </p>
            <p className="text-muted-foreground">{promise}</p>
            <p className="text-muted-foreground">Once you pay, we start as soon as your brief is confirmed. If we can&apos;t deliver, the money comes back to you.</p>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pay by card, UPI or bank</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="tabular font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{price}</p>
              <PayButton orderId={o.id} amount={o.price_total} currency={o.currency ?? "USD"} />
              <p className="text-[length:var(--fs-2)] text-muted-foreground">Secure checkout by Razorpay.</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3 text-[length:var(--fs-2)]">
              <p className="text-[length:var(--fs-3)] font-medium">Paying by Wise, bank transfer or PayPal?</p>
              <p className="text-muted-foreground">Message the team for the details. We confirm your payment as soon as it arrives.</p>
              <Link href={`/messages/${o.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Message the team
              </Link>
            </CardBody>
          </Card>

          <form action={transitionAction}>
            <input type="hidden" name="order_id" value={o.id} />
            <input type="hidden" name="to_status" value="CANCELLED" />
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              Decline this price
            </Button>
          </form>
        </div>
      </div>
    </Page>
  );
}
