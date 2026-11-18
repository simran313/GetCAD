import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { type InvoiceData, invoiceFileName } from "@/core/billing";
import { renderInvoice } from "@/lib/pdf/invoice";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * An order's invoice as a PDF (0072), for its client or finance, read as the
 * caller. Issued on first request if the payment did not issue it already;
 * the same number every time after.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { orderId } = await ctx.params;
  const supabase = await createUserSupabaseClient();

  const issued = await supabase.rpc("issue_invoice", { p_order_id: orderId });
  if (issued.error) {
    const notPaid = /not paid yet/i.test(issued.error.message);
    return NextResponse.json({ error: notPaid ? "This order is not paid yet." : "not found" }, { status: notPaid ? 409 : 404 });
  }
  const { data, error } = await supabase.rpc("invoice_data", { p_order_id: orderId });
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const d = data as InvoiceData;
  const file = await renderInvoice(d);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoiceFileName(d.number)}"`,
      "cache-control": "private, no-store",
    },
  });
}
