import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { renderSummarySheet, type SummaryData } from "@/lib/pdf/summarySheet";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The summary sheet PDF (Phase 13a), made on request from
 * summary_sheet_data() read as the caller: the client from approval on, the
 * order's team and admins. Never the designer (the database refuses). The two
 * images are read with the service role only after that check passed.
 */
type Images = Record<string, { key: string; type: string }>;

async function image(key: string | undefined): Promise<Buffer | null> {
  if (!key) return null;
  const { data } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).download(key);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("summary_sheet_data", { p_order_id: id });
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = data as SummaryData & { images: Images };
  const [render, technical] = await Promise.all([image(d.images.RENDER?.key), image(d.images.TECH?.key)]);
  const pdf = await renderSummarySheet(d, { render, technical });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="summary-${(d.ref ?? "order").replace(/[^A-Za-z0-9-]/g, "")}-v${d.version}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
