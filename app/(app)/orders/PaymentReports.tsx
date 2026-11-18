import { formatDateTime } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

const WORDS: Record<string, string> = { BANK_TRANSFER: "bank transfer", WISE: "Wise", PAYPAL: "PayPal", OTHER: "another way" };

/**
 * What the client reported paying outside the checkout (0072), shown to
 * finance beside Mark paid. Nothing for anyone else.
 */
export async function PaymentReports({ orderId }: { orderId: string }) {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("offline_payment_reports_for", { p_order_id: orderId });
  if (error || !data || (data as unknown[]).length === 0) return null;
  const tz = await viewerZone();
  const rows = data as { id: string; method: string; reference: string | null; note: string | null; created_at: string }[];
  return (
    <div role="status" className="rounded-[var(--r-md)] border border-[color:var(--border-strong)] p-3 text-[length:var(--fs-2)]">
      {rows.map((r) => (
        <p key={r.id}>
          <span className="font-medium">The client says they paid by {WORDS[r.method] ?? r.method}</span>
          {r.reference && <span> · ref <span className="font-mono">{r.reference}</span></span>}
          <span className="text-muted-foreground"> · {formatDateTime(r.created_at, tz)}</span>
          {r.note && <span className="block text-muted-foreground">{r.note}</span>}
        </p>
      ))}
      <p className="mt-1 text-muted-foreground">Check it arrived, then mark it paid with the same reference.</p>
    </div>
  );
}
