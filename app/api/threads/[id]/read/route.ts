import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * "The viewer has seen this thread as it is now" (Phase 14): an open, visible
 * chat calls this so the other side's ticks turn blue (mark_thread_read,
 * 0053). A plain request rather than a server action, so it never waits in
 * line with (or delays) a press the person makes. Answers with no body.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Only the portal itself marks a thread read.
  if (req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_thread_read", { p_thread_id: id });
  return new NextResponse(null, { status: error ? 404 : 204 });
}
