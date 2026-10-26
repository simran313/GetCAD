import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { escrowSign, type EscrowKind } from "@/core";
import { loadClientOrders, type ClientOrder } from "@/lib/client/orders";

/**
 * The client's money, read-only (W1–W3, Phase 5b). Top-ups and paying from
 * the wallet arrive with the payment providers (Phase 9; wallet_checkout is
 * off), so this shows what exists today: credit from late first looks,
 * payments held in orders, and refunds.
 */
export interface WalletLine {
  at: string;
  label: string;
  detail: string;
  amount: number;
  currency: string;
  orderId: string | null;
}

export interface Wallet {
  creditCents: number;
  heldCents: number;
  heldOrders: ClientOrder[];
  lines: WalletLine[];
  paidOrders: ClientOrder[];
}

const LEDGER_WORDS: Partial<Record<EscrowKind, string>> = {
  HOLD: "Paid for order",
  REFUND: "Refunded",
  RELEASE: "Order closed",
};

export async function loadWallet(supabase: SupabaseClient): Promise<Wallet> {
  const orders = await loadClientOrders(supabase);
  const ids = orders.map((o) => o.id);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const [{ data: credits }, { data: ledger }] = await Promise.all([
    supabase.from("client_credits").select("id, order_id, kind, amount_cents, currency, status, decided_amount_cents, decided_at, created_at"),
    ids.length
      ? supabase.from("escrow_ledger").select("order_id, kind, amount, currency, created_at").in("order_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  type CreditRow = { order_id: string | null; amount_cents: number; currency: string; status: string; decided_amount_cents: number | null; created_at: string; decided_at: string | null };
  type LedgerRow = { order_id: string; kind: EscrowKind; amount: number; currency: string; created_at: string };

  const creditRows = (credits ?? []) as CreditRow[];
  const ledgerRows = (ledger ?? []) as LedgerRow[];

  const creditCents = creditRows
    .filter((c) => c.status === "apply_next" || c.status === "partial")
    .reduce((s, c) => s + (c.decided_amount_cents ?? c.amount_cents), 0);

  const heldBy = new Map<string, number>();
  for (const l of ledgerRows) heldBy.set(l.order_id, (heldBy.get(l.order_id) ?? 0) + escrowSign(l.kind) * l.amount);
  const heldOrders = orders.filter((o) => (heldBy.get(o.id) ?? 0) > 0 && !["CLOSED", "PAYOUT_RELEASED"].includes(o.status));
  const heldCents = heldOrders.reduce((s, o) => s + (heldBy.get(o.id) ?? 0), 0);

  const lines: WalletLine[] = [
    ...ledgerRows
      .filter((l) => LEDGER_WORDS[l.kind])
      .map((l) => ({
        at: l.created_at,
        label: LEDGER_WORDS[l.kind]!,
        detail: [byId.get(l.order_id)?.title, byId.get(l.order_id)?.display_ref].filter(Boolean).join(" · "),
        amount: l.kind === "REFUND" ? l.amount : -l.amount,
        currency: l.currency,
        orderId: l.order_id,
      })),
    ...creditRows
      .filter((c) => ["apply_next", "partial", "applied", "refunded"].includes(c.status))
      .map((c) => ({
        at: c.decided_at ?? c.created_at,
        label: c.status === "refunded" ? "Late first look · refunded" : "Late first look · credit",
        detail: [c.order_id ? byId.get(c.order_id)?.title : null, c.order_id ? byId.get(c.order_id)?.display_ref : null].filter(Boolean).join(" · "),
        amount: c.decided_amount_cents ?? c.amount_cents,
        currency: c.currency,
        orderId: c.order_id,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const paidOrders = orders.filter((o) => o.paid_at).sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
  return { creditCents, heldCents, heldOrders, lines, paidOrders };
}
