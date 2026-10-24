import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * The brief's reference pictures for the job and QC screens (D4, P2). The
 * rows are read as the user, so RLS decides which come back (a designer only
 * on their own job); the service role then signs only those, for 30 minutes.
 */
export interface RefImage {
  id: string;
  url: string;
  isPrimary: boolean;
  pins: { xBp: number; yBp: number; label: string }[];
}

interface Row {
  id: string;
  object_key: string;
  is_primary: boolean;
  order_reference_pins: { x_bp: number; y_bp: number; label: string; position: number }[] | null;
}

export async function loadReferences(supabase: SupabaseClient, orderId: string): Promise<RefImage[]> {
  const { data } = await supabase
    .from("order_reference_images")
    .select("id, object_key, is_primary, position, order_reference_pins(x_bp, y_bp, label, position)")
    .eq("order_id", orderId)
    .order("position");
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  const out: RefImage[] = [];
  for (const r of rows) {
    const { data: signed } = await storage.createSignedUrl(r.object_key, 60 * 30);
    if (!signed?.signedUrl) continue;
    out.push({
      id: r.id,
      url: signed.signedUrl,
      isPrimary: r.is_primary,
      pins: (r.order_reference_pins ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ xBp: p.x_bp, yBp: p.y_bp, label: p.label })),
    });
  }
  return out;
}
