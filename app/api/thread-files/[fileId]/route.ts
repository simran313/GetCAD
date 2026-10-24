import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { ORDER_FILES_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Download a file sent in an order conversation (Phase 4b) via a short-lived
 * signed URL. thread_file_for_download() runs AS THE USER and returns the
 * storage key only where the caller may read that thread, so a designer asking
 * for a client-thread file gets nothing. Not found and not allowed answer the
 * same 404, as in /api/files: existence is not confirmed to anyone.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { fileId } = await ctx.params;
  const notFound = NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("thread_file_for_download", { p_file_id: fileId }).maybeSingle();
  if (error || !data) return notFound;
  const file = data as { object_key: string; file_name: string };

  const signed = await createAdminSupabaseClient()
    .storage.from(ORDER_FILES_BUCKET)
    .createSignedUrl(file.object_key, SIGNED_URL_TTL_SECONDS, { download: file.file_name });
  if (signed.error || !signed.data) {
    return NextResponse.json({ error: "could not sign url" }, { status: 500 });
  }
  return NextResponse.redirect(signed.data.signedUrl);
}
