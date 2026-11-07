import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { ORDER_FILES_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * A brief's reference picture, for the brief card in the chat (owner, 7 Nov
 * 2026). The row is read AS THE USER, so row-level security decides: the
 * order's client, the team on it, the assigned designer. Then a short-lived
 * signed URL. Not found and not allowed answer the same 404.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ imageId: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { imageId } = await ctx.params;
  const notFound = NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.from("order_reference_images").select("object_key").eq("id", imageId).maybeSingle();
  if (error || !data) return notFound;

  const signed = await createAdminSupabaseClient()
    .storage.from(ORDER_FILES_BUCKET)
    .createSignedUrl((data as { object_key: string }).object_key, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) return NextResponse.json({ error: "could not sign url" }, { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
