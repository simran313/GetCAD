import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { createUserSupabaseClient } from "@/lib/supabase/server";

import { loadConversations, loadOpen } from "../load";
import { MessagesView } from "../MessagesView";

/** C7b — one conversation (the list stays beside it at desk width). */
export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { orderId } = await params;
  const { t } = await searchParams;
  const supabase = await createUserSupabaseClient();
  const [{ data: me }, conversations, open] = await Promise.all([
    supabase.from("users").select("role").maybeSingle(),
    loadConversations(supabase),
    loadOpen(supabase, orderId),
  ]);
  if (!open) notFound();
  return (
    <MessagesView
      conversations={conversations}
      open={open}
      role={(me as { role: string } | null)?.role ?? "CLIENT"}
      startOn={t === "designer" ? "internal" : undefined}
    />
  );
}
