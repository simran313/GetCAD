import { auth } from "@clerk/nextjs/server";
import { Box, ChevronRight, Copy, ImageIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { draftProgress, formatDay, formatRelative } from "@/core";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { briefName, loadClientOrders } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

import { duplicateBriefAction, startBriefAction } from "../[id]/brief/actions";
import { OrderMenu } from "../OrderMenu";

/**
 * N0 — New order. Two equal choices (CAD design, Renders); then the fastest
 * way for a repeat client, a past order copied into a new brief and opened on
 * Review; then drafts to finish. Nothing is charged here: that is said once,
 * beside the price.
 */
export const dynamic = "force-dynamic";

interface SpecRow {
  order_id: string;
  reference_name: string | null;
  product: string | null;
  metal: string | null;
  karatage: string | null;
  ring_size: string | null;
  inner_circumference_um: number | null;
  inner_diameter_um: number | null;
  length_um: number | null;
  updated_at: string;
}

const TILE = "rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]";
const ROW = "flex min-h-[var(--ctl-lg)] w-full min-w-0 items-center gap-3 px-[var(--s-4)] py-[var(--s-3)] text-left transition-colors hover:bg-subtle";

export default async function NewOrderPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const tz = await viewerZone();

  const supabase = await createUserSupabaseClient();
  const orders = await loadClientOrders(supabase).catch(() => []);
  const ids = orders.map((o) => o.id);
  const [specsRes, imagesRes] = ids.length
    ? await Promise.all([
        supabase
          .from("order_specs")
          .select("order_id, reference_name, product, metal, karatage, ring_size, inner_circumference_um, inner_diameter_um, length_um, updated_at")
          .in("order_id", ids),
        supabase.from("order_reference_images").select("order_id").in("order_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const specs = new Map(((specsRes.data ?? []) as SpecRow[]).map((s) => [s.order_id, s]));
  const pictures = new Map<string, number>();
  for (const r of (imagesRes.data ?? []) as { order_id: string }[]) pictures.set(r.order_id, (pictures.get(r.order_id) ?? 0) + 1);

  // Drafts: every one with something in it, and at most one empty one.
  const allDrafts = orders.filter((o) => o.status === "DRAFT");
  const used = allDrafts.filter((o) => specs.has(o.id) || pictures.has(o.id));
  const empty = allDrafts.find((o) => !specs.has(o.id) && !pictures.has(o.id));
  const drafts = [...used, ...(empty ? [empty] : [])].slice(0, 5);

  const past = orders
    .filter((o) => !["DRAFT", "CANCELLED"].includes(o.status) && specs.get(o.id)?.product)
    .slice(0, 5);

  const progress = (o: (typeof orders)[number]): string => {
    const spec = specs.get(o.id);
    return draftProgress(spec?.product, {
      referenceImageCount: pictures.get(o.id) ?? 0,
      service: o.service,
      size: {
        ringSize: spec?.ring_size,
        innerCircumferenceUm: spec?.inner_circumference_um,
        innerDiameterUm: spec?.inner_diameter_um,
        lengthUm: spec?.length_um,
      },
    });
  };

  return (
    <Page>
      <PageHeader title="New order" />

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { service: "cad", title: "CAD design", sub: "3DM and STL, ready to cast", Icon: Box },
          { service: "render", title: "Renders", sub: "Photo-real images of your piece", Icon: ImageIcon },
        ].map(({ service, title, sub, Icon }) => (
          <form key={service} action={startBriefAction}>
            <input type="hidden" name="service" value={service} />
            <button type="submit" className={`${TILE} flex w-full items-center gap-4 text-left transition-colors hover:border-foreground`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-subtle" aria-hidden>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)]">{title}</span>
                <span className="block text-[length:var(--fs-3)] text-muted-foreground">{sub}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </form>
        ))}
      </div>

      {past.length > 0 && (
        <section aria-labelledby="past-title" className="space-y-2">
          <h2 id="past-title" className="text-[length:var(--fs-4)] font-semibold">
            Start from a past order
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            {past.map((o) => {
              const spec = specs.get(o.id)!;
              return (
                <li key={o.id}>
                  <form action={duplicateBriefAction}>
                    <input type="hidden" name="from_order_id" value={o.id} />
                    <button type="submit" className={ROW}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.title}</span>
                        <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">
                          {[spec.reference_name ? briefName(spec) : null, formatDay(o.created_at, tz)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {drafts.length > 0 && (
        <section aria-labelledby="drafts-title" className="space-y-2">
          <h2 id="drafts-title" className="text-[length:var(--fs-4)] font-semibold">
            Drafts
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            {drafts.map((o) => {
              const spec = specs.get(o.id);
              const name = spec?.reference_name || briefName(spec ?? null);
              const edited = spec?.updated_at ?? o.created_at;
              return (
                <li key={o.id} className="flex items-center pr-[var(--s-2)]">
                  <Link href={`/orders/${o.id}/brief`} className={ROW}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name}</span>
                      <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">
                        {progress(o)} · {formatRelative(edited, tz)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                  <OrderMenu orderId={o.id} name={name} cancel="Delete draft" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link
        href="/messages"
        className="flex min-h-[var(--ctl-lg)] items-center gap-3 rounded-[var(--r-lg)] px-[var(--s-2)] text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        Prefer email or WhatsApp? Message us
        <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
      </Link>
    </Page>
  );
}
