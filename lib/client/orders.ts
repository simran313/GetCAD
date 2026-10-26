import "server-only";

import { formatDay } from "@/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The client's orders as the redesigned screens show them (Phase 5b): what
 * visible_orders() returns for them, with the name they gave each piece.
 * Read as the user, so RLS decides what comes back.
 */
export interface ClientOrder {
  id: string;
  display_ref: string | null;
  product_type: string;
  status: string;
  service: string;
  category: string | null;
  currency: string | null;
  price_total: number | null;
  sla_status: string;
  sla_due_at: string | null;
  first_look_at: string | null;
  source: string | null;
  created_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  /** The client's own label for the piece, from the brief. */
  title: string;
  client_po: string | null;
}

const PRODUCT_WORDS: Record<string, string> = {
  RING: "Ring",
  BAND: "Band",
  PENDANT: "Pendant",
  EARRING: "Earrings",
  BRACELET: "Bracelet",
  BANGLE: "Bangle",
  NECKLACE: "Necklace",
  BROOCH: "Brooch",
  OTHER: "Piece",
  CAD_MODEL: "New piece",
};

export function productWord(product: string | null | undefined): string {
  if (!product) return "New piece";
  return PRODUCT_WORDS[product.toUpperCase()] ?? product;
}

export async function loadClientOrders(supabase: SupabaseClient, orderId?: string): Promise<ClientOrder[]> {
  const { data, error } = await supabase
    .rpc("visible_orders", orderId ? { p_order_id: orderId } : {})
    .select(
      "id, display_ref, product_type, status, service, category, currency, price_total, sla_status, sla_due_at, first_look_at, source, created_at, confirmed_at, paid_at",
    );
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<ClientOrder, "title" | "client_po">[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [specs, pos] = await Promise.all([
    supabase.from("order_specs").select("order_id, reference_name, product").in("order_id", ids),
    supabase.from("orders").select("id, client_po").in("id", ids),
  ]);
  const name = new Map(
    ((specs.data ?? []) as { order_id: string; reference_name: string; product: string }[]).map((s) => [
      s.order_id,
      s.reference_name || productWord(s.product),
    ]),
  );
  const po = new Map(((pos.data ?? []) as { id: string; client_po: string | null }[]).map((p) => [p.id, p.client_po]));

  return rows.map((r) => ({
    ...r,
    title: name.get(r.id) ?? productWord(r.product_type),
    client_po: po.get(r.id) ?? null,
  }));
}

export function serviceWord(service: string): string {
  return service === "render" ? "Renders" : service === "cad_render" ? "CAD + renders" : "CAD";
}

/** A day in a list, in the viewer's zone ("Mon, Oct 12"); "—" when unknown. */
export function shortDate(iso: string | null, zone: string): string {
  return iso ? formatDay(iso, zone) : "—";
}
