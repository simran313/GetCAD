import { auth } from "@clerk/nextjs/server";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { briefRows } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { sendBriefAction } from "../actions";

/**
 * N5 — Review. The brief as compact rows; tap any row to change it (the
 * wizard opens on that step). What the DECISIONS §11 minimum still needs
 * (brief_missing, the same rule submit_brief applies) shows as an inline
 * "Add" on its row, so nothing is a surprise here: the wizard's chip already
 * asked for it. Send is the one primary action.
 */
export const dynamic = "force-dynamic";

export default async function ReviewBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const supabase = await createUserSupabaseClient();
  const { data: order } = await supabase
    .rpc("visible_orders", { p_order_id: id })
    .select("id, status, relation, service")
    .maybeSingle();
  if (!order || (order as { relation: string }).relation !== "CLIENT") redirect(`/orders/${id}`);
  const o = order as { id: string; status: string; service: string };
  if (o.status !== "DRAFT") redirect(`/orders/${id}`);

  const [specRes, missingRes, imagesRes, accentsRes] = await Promise.all([
    supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.rpc("brief_missing", { p_order_id: id }),
    supabase.from("order_reference_images").select("id").eq("order_id", id),
    supabase.from("order_spec_accents").select("quantity").eq("order_id", id),
  ]);
  const spec = specRes.data as Record<string, unknown> | null;
  const missing = new Set(((missingRes.data ?? []) as string[]).filter((m) => !(o.service === "render" && m === "size")));
  // brief_missing names "reference"; the row is "photos". "product" means no brief at all.
  const needs = (key: string) => (key === "photos" ? missing.has("reference") : missing.has(key));
  const rows = briefRows(spec, {
    service: o.service,
    photos: (imagesRes.data ?? []).length,
    accents: (accentsRes.data ?? []) as { quantity: number }[],
  });

  return (
    <Page form>
      <PageHeader title="Review" />

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {rows.map((r) => {
          const add = needs(r.key);
          return (
            <li key={r.key}>
              <Link
                href={`/orders/${id}/brief?step=${r.step}#${r.field}`}
                className="flex min-h-[var(--ctl-lg)] items-center gap-3 px-[var(--s-4)] py-[var(--s-3)] transition-colors hover:bg-subtle"
              >
                <span className="w-28 shrink-0 text-[length:var(--fs-2)] text-muted-foreground">{r.label}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[length:var(--fs-3)]",
                    add && "inline-flex items-center gap-1 font-medium text-[color:var(--tone-danger-fg)]",
                  )}
                >
                  {add ? (
                    <>
                      <Plus className="h-4 w-4" aria-hidden /> Add
                    </>
                  ) : (
                    (r.value ?? "—")
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>

      <form
        action={sendBriefAction}
        className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-[var(--s-4)] border-t border-border bg-background/95 px-[var(--s-4)] py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0"
      >
        <input type="hidden" name="order_id" value={id} />
        <Button type="submit" size="lg" disabled={missing.size > 0} className="w-full md:w-auto">
          Send for a price
        </Button>
      </form>
    </Page>
  );
}
