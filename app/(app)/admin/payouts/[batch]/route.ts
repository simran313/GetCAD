import { auth } from "@clerk/nextjs/server";

import { payoutBatchCsv, type PayoutBatchRow } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * One payout batch as a bank-transfer CSV (Phase 3b).
 *
 * Read AS THE USER: payout_batch_rows() is the finance/admin check, and it
 * writes the identity-read audit entry for the full account numbers. Never
 * cached: the file holds bank details.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ batch: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response("sign in first", { status: 401 });

  const { batch } = await params;
  if (!/^PB-[0-9-]{1,40}$/.test(batch)) return new Response("not found", { status: 404 });

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("payout_batch_rows", { p_batch: batch });
  if (error) {
    const status = /only finance/i.test(error.message) ? 403 : /not found/i.test(error.message) ? 404 : 500;
    return new Response(error.message, { status });
  }

  return new Response(payoutBatchCsv(batch, (data ?? []) as PayoutBatchRow[]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batch}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
