import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * "Has anything changed in my conversations?" for an open Messages list
 * (Phase 15). One string from the same function the list is built from
 * (my_conversations, 0046): the newest message time and the number of
 * messages. Changes when anyone writes in a thread the caller may read, so
 * the team, who are not notified of every message, see it too. Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("my_conversations").select("last_at, messages");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  let newest = "";
  let count = 0;
  for (const r of (data ?? []) as { last_at: string | null; messages: number }[]) {
    if (r.last_at && r.last_at > newest) newest = r.last_at;
    count += r.messages;
  }
  return NextResponse.json({ stamp: `${newest}|${count}` }, { headers: { "Cache-Control": "no-store" } });
}
