import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { grantedObjectKey } from "@/lib/files/access";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * The same file, streamed from this origin (owner, 2 Nov 2026: the final
 * review's 3D view did not load). The browser's 3D viewer reads the STL with
 * fetch; when the storage host does not allow that from our pages, the
 * viewer falls back to this. Same gate as /api/files/[versionId]
 * (lib/files/access), no signed URL handed out; the bytes are piped, not
 * held in memory.
 */
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ versionId: string }> }): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { versionId } = await ctx.params;
  const granted = await grantedObjectKey(versionId);
  if (!granted) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: signed } = await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).createSignedUrl(granted.objectKey, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "could not read the file" }, { status: 500 });
  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "could not read the file" }, { status: 502 });
  const headers = new Headers({ "content-type": upstream.headers.get("content-type") ?? "application/octet-stream", "cache-control": "private, no-store" });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  return new Response(upstream.body, { status: 200, headers });
}
