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
  const [{ data: me }, conversations] = await Promise.all([supabase.from("users").select("role").maybeSingle(), loadConversations(supabase)]);
  return <MessagesView conversations={conversations} open={null} role={(me as { role: string } | null)?.role ?? "CLIENT"} />;
}
