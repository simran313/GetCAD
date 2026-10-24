import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { renderWeightSheet, type WeightSheetData } from "@/lib/pdf/weightSheet";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The weight sheet PDF (A4), made on request from weight_sheet_data(),
 * read as the caller: the client after QC, the team, the order's designer.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("weight_sheet_data", { p_order_id: id });
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = data as WeightSheetData;
  const pdf = await renderWeightSheet(d);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="weight-sheet-${(d.ref ?? "order").replace(/[^A-Za-z0-9-]/g, "")}-v${d.version}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
