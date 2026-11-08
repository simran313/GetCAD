import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatBrief } from "@/app/(app)/orders/types";
import { productWord } from "@/lib/client/orders";
import { briefLines, type AccentLine, type BriefRow } from "@/lib/work/brief";

/**
 * The brief card at the top of an order's conversations (owner, 7 Nov 2026).
 * Every read runs as the viewer, so the database decides what comes back: a
 * designer reads job_brief() (without the client's name for the job) and only
 * on their own job; reference pictures by row-level security. Nothing here
 * names the client.
 */
export async function loadChatBrief(supabase: SupabaseClient, orderId: string, relation: string): Promise<ChatBrief | null> {
  // A designer reads job_brief(); anyone else the brief row, which the
  // database refuses a designer (so a designer on this path gets no card).
  const designer = relation === "DESIGNER";
  const [specRes, accentsRes, imagesRes] = await Promise.all([
    designer ? supabase.rpc("job_brief", { p_order_id: orderId }) : supabase.from("order_specs").select("*").eq("order_id", orderId).maybeSingle(),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", orderId).order("position"),
    supabase
      .from("order_reference_images")
      .select("id, position, order_reference_pins(label, position)")
      .eq("order_id", orderId)
      .order("position"),
  ]);
  const spec = (specRes.data ?? null) as BriefRow | null;
  if (!spec) return null;
  const images = ((imagesRes.data ?? []) as { id: string; order_reference_pins: { label: string; position: number }[] | null }[]).map((r) => ({
    id: r.id,
    pins: (r.order_reference_pins ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => p.label),
  }));
  const product = spec.product ? productWord(spec.product as string) : "The piece";
  const named = !designer && typeof spec.reference_name === "string" && spec.reference_name.trim() ? spec.reference_name.trim() : null;
  return {
    title: named ?? product,
    lines: briefLines(spec, (accentsRes.data ?? []) as AccentLine[]).filter((l) => l.label !== "Product" || !!named),
    notes: typeof spec.notes === "string" && spec.notes.trim() ? spec.notes.trim() : null,
    images,
  };
}
