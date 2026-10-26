import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { productWord } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { sendBriefAction } from "../actions";
import { Page } from "@/components/ui/page";

/**
 * N5 — Review your order (docs/design). What was asked for, what is still
 * missing for a price (brief_missing, the DECISIONS §11 minimum), and the
 * button that sends it. submit_brief() checks the same minimum again.
 */
export const dynamic = "force-dynamic";

const MISSING_WORDS: Record<string, string> = {
  product: "What the piece is",
  reference: "At least one reference picture",
  size: "The size (ring size, inner diameter or length)",
  metal: "The metal",
};

const pretty = (v: string | null | undefined) =>
  v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—";

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

  const [specRes, missingRes, imagesRes] = await Promise.all([
    supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.rpc("brief_missing", { p_order_id: id }),
    supabase.from("order_reference_images").select("id").eq("order_id", id),
  ]);
  const spec = specRes.data as Record<string, string | number | boolean | null> | null;
  const missing = ((missingRes.data ?? []) as string[]).filter((m) => !(o.service === "render" && m === "size"));
  const images = (imagesRes.data ?? []).length;

  const rows: [string, string][] = spec
    ? [
        ["Your name for it", String(spec.reference_name ?? "—")],
        ["Product", productWord(spec.product as string)],
        ["Service", o.service === "render" ? "Renders" : "CAD design"],
        ["Size", String(spec.ring_size ?? (spec.inner_diameter_um ? `${Number(spec.inner_diameter_um) / 1000} mm inside` : spec.length_um ? `${Number(spec.length_um) / 1000} mm long` : "—"))],
        ["Metal", [pretty(spec.metal as string), spec.karatage].filter(Boolean).join(" · ")],
        ["Centre stone", spec.has_centre_stone ? `${pretty(spec.centre_shape as string)} · ${pretty(spec.centre_setting as string)}` : "None"],
        ["Finish", pretty(spec.finish as string)],
        ["Reference pictures", String(images)],
        ["Notes", String(spec.notes ?? "—")],
      ]
    : [];

  return (
    <Page form>
      <PageHeader title="Review" description="Check it, then send it for a price. Nothing is charged yet." />

      {missing.length > 0 && (
        <Card className="border-foreground">
          <CardBody>
            <p className="text-[length:var(--fs-4)] font-medium">Still needed before we can price it</p>
            <ul className="mt-2 list-disc pl-5 text-[length:var(--fs-3)]">
              {missing.map((m) => (
                <li key={m}>{MISSING_WORDS[m] ?? m}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card as="section">
        <CardHeader>
          <CardTitle>Your brief</CardTitle>
          <Link href={`/orders/${id}/brief`} className="text-[length:var(--fs-2)] underline underline-offset-4">
            Edit
          </Link>
        </CardHeader>
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 px-[var(--s-5)] py-[var(--s-3)]">
              <dt className="text-[length:var(--fs-2)] text-muted-foreground">{k}</dt>
              <dd className="whitespace-pre-wrap text-[length:var(--fs-3)]">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-2">
        <form action={sendBriefAction}>
          <input type="hidden" name="order_id" value={id} />
          <Button type="submit" size="lg" disabled={missing.length > 0}>
            Send for a price
          </Button>
        </form>
        <Link href={`/orders/${id}/brief`} className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Back to edit
        </Link>
      </div>
      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        You&apos;ll get a price within the hour. The clock for your first look starts once you have paid and
        we have confirmed the brief.
      </p>
    </Page>
  );
}
