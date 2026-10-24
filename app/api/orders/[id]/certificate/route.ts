import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { ORDER_FILES_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The stored QC certificate (A2): the client once QC has passed, and the
 * team. certificate_for_download() decides, as the caller; then a short
 * signed URL for exactly that object. 404 for not-found and not-allowed alike.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const v = Number(req.nextUrl.searchParams.get("v")) || null;
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.rpc("certificate_for_download", { p_order_id: id, p_version: v }).maybeSingle();
  const row = data as { object_key: string } | null;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const signed = await createAdminSupabaseClient()
    .storage.from(ORDER_FILES_BUCKET)
    .createSignedUrl(row.object_key, SIGNED_URL_TTL_SECONDS);
  if (!signed.data?.signedUrl) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, { status: 302 });
}
