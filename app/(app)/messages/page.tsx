import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { createUserSupabaseClient } from "@/lib/supabase/server";

import { loadConversations } from "./load";
import { MessagesView } from "./MessagesView";

/** C7 — Messages. At desk width the newest conversation opens beside the list. */
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const [conversations, { data: me }] = await Promise.all([
    loadConversations(supabase),
    supabase.from("users").select("role").maybeSingle(),
  ]);
  return <MessagesView conversations={conversations} open={null} role={(me as { role: string } | null)?.role ?? "CLIENT"} />;
}
