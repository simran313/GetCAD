import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * What applies to an order beyond its own brief (0062): the client's master
 * instructions and the diamond certificate pictures. Both come through
 * functions that check the viewer may see the order; the service role then
 * signs only the certificate keys that came back, for 30 minutes.
 */
export interface Standing {
  master: { body: string; updatedAt: string } | null;
  certificates: { id: string; url: string; isPdf: boolean }[];
}

export async function loadStanding(supabase: SupabaseClient, orderId: string): Promise<Standing> {
  const [masterRes, certRes] = await Promise.all([
    supabase.rpc("order_master_instructions", { p_order_id: orderId }).maybeSingle(),
    supabase.rpc("order_stone_certificates_for", { p_order_id: orderId }),
  ]);
  const m = masterRes.error ? null : (masterRes.data as { body: string; updated_at: string } | null);
  const rows = (certRes.error ? [] : (certRes.data ?? [])) as CertRow[];
  const certificates = await signCertificates(rows);
  return { master: m ? { body: m.body, updatedAt: m.updated_at } : null, certificates };
}

export interface CertRow {
  id: string;
  object_key: string;
  content_type: string;
}

export async function signCertificates(rows: CertRow[]): Promise<{ id: string; url: string; isPdf: boolean }[]> {
  if (rows.length === 0) return [];
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  const out: { id: string; url: string; isPdf: boolean }[] = [];
  for (const r of rows) {
    const { data } = await storage.createSignedUrl(r.object_key, 60 * 30);
    if (data?.signedUrl) out.push({ id: r.id, url: data.signedUrl, isPdf: r.content_type === "application/pdf" });
  }
  return out;
}
