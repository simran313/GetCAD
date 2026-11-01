import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Open a pod material (Phase 13b). pod_material_file() decides, as the
 * caller, whether they may (a member of that pod, or an admin); then a
 * one-minute signed link. PDFs and images open in the browser.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.rpc("pod_material_file", { p_id: id });
  const file = data as { object_key: string; content_type: string; file_name: string } | null;
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const inline = /^(application\/pdf|image\/(png|jpeg))$/.test(file.content_type);
  const { data: signed, error } = await createAdminSupabaseClient()
    .storage.from(ORDER_FILES_BUCKET)
    .createSignedUrl(file.object_key, 60, inline ? undefined : { download: file.file_name });
  if (error || !signed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
