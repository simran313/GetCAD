import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { DESIGNER_DOCUMENTS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Open one designer document (owner, 4 Nov 2026). The database decides
 * (admins only) and records the open in the audit log; only then is a
 * short-lived link to the private file made. Nothing is cached.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Sign in first.", { status: 401 });
  const { id } = await params;

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("designer_document_open", { p_id: id }).maybeSingle();
  const doc = data as { object_key: string; file_name: string } | null;
  if (error || !doc) return new NextResponse("Not available.", { status: 404, headers: { "Cache-Control": "no-store" } });

  const signed = await createAdminSupabaseClient()
    .storage.from(DESIGNER_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.object_key, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) return new NextResponse("The file could not be opened.", { status: 502, headers: { "Cache-Control": "no-store" } });

  const res = NextResponse.redirect(signed.data.signedUrl, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
