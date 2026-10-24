import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { csvCell } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { PodJob } from "@/lib/work/load";

/**
 * A2 "Export CSV": the orders the caller may see (pod_jobs, as the user),
 * by reference only. Money in dollars and rupees as stored, no names.
 */
export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("pod_jobs");
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const header = ["order_ref", "title", "status", "category", "client_code", "designer_ref", "pod", "created_at", "paid_at", "first_look_due", "currency", "price", "designer_pay_inr", "qc_pay_inr"];
  const lines = ((data ?? []) as PodJob[]).map((j) =>
    [
      j.order_ref,
      j.title,
      j.status,
      j.category,
      j.client_code,
      j.designer_ref,
      j.pod_name,
      j.created_at,
      j.paid_at,
      j.sla_due_at,
      j.currency,
      j.price_total != null ? (j.price_total / 100).toFixed(2) : "",
      j.designer_payout_paise != null ? (j.designer_payout_paise / 100).toFixed(2) : "",
      j.qc_payout_paise != null ? (j.qc_payout_paise / 100).toFixed(2) : "",
    ]
      .map((v) => csvCell(v == null ? "" : String(v)))
      .join(","),
  );
  const body = [header.join(","), ...lines].join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
