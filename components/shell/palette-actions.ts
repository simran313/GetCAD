"use server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

import type { ShellOrder } from "./app-shell";

/**
 * What Cmd+K lists beyond the pages: the orders this person may see
 * (visible_orders, the same per-role read the lists use) and, for admins,
 * client codes (admin_clients refuses anyone else). Fetched when the palette
 * first opens instead of on every page load (Phase 11a).
 */
export async function paletteDataAction(): Promise<{ orders: ShellOrder[]; clients: string[] }> {
  const supabase = await createUserSupabaseClient();
  const [ordersRes, clientsRes] = await Promise.all([
    supabase.rpc("visible_orders").select("id, display_ref, product_type, status").limit(200),
    supabase.rpc("admin_clients").select("client_code"),
  ]);
  const orders = ((ordersRes.data ?? []) as { id: string; display_ref: string | null; product_type: string | null; status: string }[]).map((o) => ({
    id: o.id,
    ref: o.display_ref ?? o.id,
    product: o.product_type,
    status: o.status,
  }));
  const clients = clientsRes.error
    ? []
    : ((clientsRes.data ?? []) as { client_code: string | null }[]).flatMap((r) => (r.client_code ? [r.client_code] : []));
  return { orders, clients };
}
