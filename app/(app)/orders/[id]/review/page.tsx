import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { REVIEW_KINDS } from "@/core";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { productWord } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { requestRevisionAction, transitionAction } from "../../actions";
import type { RevisionAllowance } from "../../RevisionsPanel";

/**
 * C6 — Review renders (docs/design). The five views plus diamond details
 * and gold weight of the current version (owner answer Q20), then approve —
 * which unlocks STL, 3DM and the summary — or ask for changes within the
 * included rounds. Images load through /api/files, which applies the
 * download gate as everywhere else.
 */
export const dynamic = "force-dynamic";

const REVIEW = new Set<string>(REVIEW_KINDS);

export default async function ReviewRendersPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const supabase = await createUserSupabaseClient();
  const { data } = await supabase
    .rpc("visible_orders", { p_order_id: id })
    .select("id, relation, status, display_ref, product_type")
    .maybeSingle();
  const o = data as { id: string; relation: string; status: string; display_ref: string | null; product_type: string } | null;
  if (!o || o.relation !== "CLIENT") redirect(`/orders/${id}`);
  // The funnel (Phase 6, 0049): the client opened their first look.
  if (o.status === "CLIENT_PREVIEW") {
    await supabase.rpc("record_marketing_event", { p_event: "first_look_viewed", p_order_id: id });
  }

  const [{ data: row }, { data: slots }, { data: spec }, { data: allowance }] = await Promise.all([
    supabase.from("orders").select("work_version").eq("id", id).maybeSingle(),
    supabase.from("deliverable_slots").select("code, label, position").order("position"),
    supabase.from("order_specs").select("reference_name").eq("order_id", id).maybeSingle(),
    supabase.rpc("revision_allowance", { p_order_id: id }),
  ]);
  const version = (row as { work_version: number } | null)?.work_version ?? 1;
  const { data: delivered } = await supabase
    .from("deliverables")
    .select("slot, file_version_id, file_name")
    .eq("order_id", id)
    .eq("version", version);
  const ids = ((delivered ?? []) as { file_version_id: string }[]).map((d) => d.file_version_id);
  const { data: versions } = ids.length
    ? await supabase.from("file_versions").select("id, kind").in("id", ids)
    : { data: [] };
  const kindOf = new Map(((versions ?? []) as { id: string; kind: string }[]).map((v) => [v.id, v.kind]));
  const labelOf = new Map(((slots ?? []) as { code: string; label: string; position: number }[]).map((s) => [s.code, s]));

  const images = ((delivered ?? []) as { slot: string; file_version_id: string; file_name: string }[])
    .filter((d) => REVIEW.has(kindOf.get(d.file_version_id) ?? ""))
    .sort((a, b) => (labelOf.get(a.slot)?.position ?? 99) - (labelOf.get(b.slot)?.position ?? 99));

  const allow = allowance as RevisionAllowance | null;
  const canDecide = o.status === "CLIENT_PREVIEW";
  const title = (spec as { reference_name?: string } | null)?.reference_name || productWord(o.product_type);

  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <PageHeader
        eyebrow={`${o.display_ref ?? ""} · version ${version}`}
        title="Review renders"
        description={title}
        actions={
          <Link href={`/orders/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open full order
          </Link>
        }
      />

      {images.length === 0 ? (
        <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">
          {canDecide ? "The renders are on their way." : "Renders appear here when they are ready for you."}
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <li key={img.file_version_id}>
              <Card className="overflow-hidden">
                <a href={`/api/files/${img.file_version_id}`} target="_blank" rel="noreferrer" className="block bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL behind the download gate */}
                  <img
                    src={`/api/files/${img.file_version_id}`}
                    alt={labelOf.get(img.slot)?.label ?? img.slot}
                    className="aspect-square w-full object-contain"
                    loading="lazy"
                  />
                </a>
                <p className="flex justify-between px-[var(--s-3)] py-[var(--s-2)] font-mono text-[length:var(--fs-2)]">
                  <span>{labelOf.get(img.slot)?.label ?? img.slot}</span>
                  <span className="text-muted-foreground">{img.slot}</span>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canDecide && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Approve</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-[length:var(--fs-2)] text-muted-foreground">
              <p>Approving unlocks the STL, 3DM and summary sheet. Changes after approval are a new order.</p>
              <form action={transitionAction}>
                <input type="hidden" name="order_id" value={id} />
                <input type="hidden" name="to_status" value="APPROVED" />
                <Button type="submit">Approve this design</Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ask for changes</CardTitle>
              {allow && (
                <span className="text-[length:var(--fs-2)] text-muted-foreground">
                  {allow.used} of {allow.included} rounds used
                </span>
              )}
            </CardHeader>
            <CardBody>
              {allow?.open ? (
                <form action={requestRevisionAction} className="space-y-2">
                  <input type="hidden" name="order_id" value={id} />
                  <Textarea
                    name="note"
                    required
                    rows={4}
                    maxLength={4000}
                    placeholder="What should change? Sizes in mm, which view, which part."
                    aria-label="What should change"
                  />
                  <Button type="submit" variant="outline">
                    Send changes
                  </Button>
                </form>
              ) : (
                <p className="text-[length:var(--fs-2)] text-muted-foreground">
                  The included rounds are used or the 14-day window has closed.{" "}
                  <Link href={`/orders/${id}#revisions`} className="underline underline-offset-4">
                    Order a change
                  </Link>{" "}
                  as a new order.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </main>
  );
}
