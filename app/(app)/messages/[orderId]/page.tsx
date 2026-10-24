import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { createUserSupabaseClient } from "@/lib/supabase/server";

import { loadConversations, loadOpen } from "../load";
import { MessagesView } from "../MessagesView";

/** C7b — one conversation (the list stays beside it at desk width). */
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { orderId } = await params;
  const supabase = await createUserSupabaseClient();
  const [conversations, open] = await Promise.all([loadConversations(supabase), loadOpen(supabase, orderId)]);
  if (!open) notFound();
  return <MessagesView conversations={conversations} open={open} />;
}
