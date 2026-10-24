import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { startBriefAction } from "../[id]/brief/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { loadClientOrders, shortDate } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * N0 — choose a service (docs/design). CAD design or renders; each creates a
 * draft and opens its brief (N1 / N7). Below, faster ways to start: drafts to
 * finish, and finished pieces to order again with changes (a new linked
 * order, owner answer Q5, from the order's Revisions panel).
 */
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const orders = await loadClientOrders(supabase).catch(() => []);
  const drafts = orders.filter((o) => o.status === "DRAFT").slice(0, 3);
  const again = orders.filter((o) => ["APPROVED", "DELIVERED", "CLOSED"].includes(o.status)).slice(0, 3);

  const services: { service: string; title: string; body: string; cta: string }[] = [
    {
      service: "cad",
      title: "CAD design",
      body: "Production-ready 3DM and STL files with weights and stones. Four short steps.",
      cta: "Start a CAD brief",
    },
    {
      service: "render",
      title: "Renders",
      body: "Photo-real images for approvals and your store, from your CAD or ours.",
      cta: "Start a render brief",
    },
  ];

  return (
    <main className="container max-w-4xl space-y-8 py-8">
      <PageHeader title="New order" description="Nothing is charged until you have a price and choose to pay." />

      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((s) => (
          <Card key={s.service}>
            <CardBody className="flex h-full flex-col gap-4">
              <h2 className="font-display text-[length:var(--fs-6)] leading-[var(--lh-6)]">{s.title}</h2>
              <p className="flex-1 text-[length:var(--fs-3)] text-muted-foreground">{s.body}</p>
              <form action={startBriefAction}>
                <input type="hidden" name="service" value={s.service} />
                <Button type="submit" className="w-full">
                  {s.cta}
                </Button>
              </form>
            </CardBody>
          </Card>
        ))}
      </div>

      {(drafts.length > 0 || again.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">
            Faster ways to start
          </h2>
          <Card>
            {drafts.map((o) => (
              <ListRow
                key={o.id}
                href={`/orders/${o.id}/brief`}
                title={`Continue draft · ${o.title}`}
                meta={`Started ${shortDate(o.created_at)}`}
                trailing={<span className="text-[length:var(--fs-2)] underline underline-offset-4">Continue</span>}
              />
            ))}
            {again.map((o) => (
              <ListRow
                key={o.id}
                href={`/orders/${o.id}#revisions`}
                title={`Order again · ${o.title}`}
                meta="Same brief, change only what's different"
                trailing={<span className="text-[length:var(--fs-2)] underline underline-offset-4">Order a change</span>}
              />
            ))}
          </Card>
        </section>
      )}

      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        Prefer to send it by email or WhatsApp? <Link href="/messages" className="underline underline-offset-4">Message the team</Link>{" "}
        and we will place the order for you.
      </p>
    </main>
  );
}
