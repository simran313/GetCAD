import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { pdfImage } from "@/lib/pdf/images";
import { renderSummarySheet, type SummaryData } from "@/lib/pdf/summarySheet";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The summary sheet PDF (Phase 13a), made on request from
 * summary_sheet_data() read as the caller: the client from approval on, the
 * order's team and admins. Never the designer (the database refuses). The two
 * images are read with the service role only after that check passed, and
 * shrunk to print size first (lib/pdf/images). If an image still cannot be
 * embedded, the sheet is made without it rather than not at all.
 */
export const maxDuration = 60;

type Images = Record<string, { key: string; type: string }>;

async function image(key: string | undefined): Promise<Buffer | null> {
  if (!key) return null;
  const { data, error } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).download(key);
  if (error || !data) {
    console.error("summary: could not read an image from storage", key, error?.message);
    return null;
  }
  return pdfImage(Buffer.from(await data.arrayBuffer()));
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("summary_sheet_data", { p_order_id: id });
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = data as SummaryData & { images?: Images | null };
  const images = d.images ?? {};
  const [render, technical] = await Promise.all([image(images.RENDER?.key), image(images.TECH?.key)]);

  let pdf: Buffer;
  try {
    pdf = await renderSummarySheet(d, { render, technical });
  } catch (e) {
    console.error("summary: rendering with images failed; trying without", id, e);
    try {
      pdf = await renderSummarySheet(d, { render: null, technical: null });
    } catch (e2) {
      console.error("summary: rendering failed", id, e2);
      return NextResponse.json({ error: "The summary sheet could not be made. The team has been told." }, { status: 500 });
    }
  }
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="summary-${(d.ref ?? "order").replace(/[^A-Za-z0-9-]/g, "")}-v${d.version}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
