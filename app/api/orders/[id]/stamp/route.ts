import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * "Has anything on this order changed?" for the order page's live refresh
 * (Phase 4b). One number: the newest audit entry the caller could see the
 * effect of (order_activity_stamp, 0045). Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("order_activity_stamp", { p_order_id: id });
  if (error || data === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ stamp: String(data) }, { headers: { "Cache-Control": "no-store" } });
}
