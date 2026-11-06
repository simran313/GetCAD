import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import type { InboxItem } from "@/lib/inbox";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * The bell (revamp R3): the caller's newest notifications and how many are
 * unread. Read as the user, so RLS returns only their own rows
 * (policies/0012). Summaries are identity-free by construction (0015).
 * Polled every 20 s while the app is open and visible; never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const supabase = await createUserSupabaseClient();
  const [list, count] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, order_id, summary, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error || count.error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(
    { unread: count.count ?? 0, items: (list.data ?? []) as InboxItem[] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
