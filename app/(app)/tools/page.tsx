import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { Calculators } from "./Calculators";

/**
 * Calculators (Phase 13e): the owner's gold casting weight and diamond weight
 * spreadsheets, in the portal, for designers, pod leads and admins. Nothing
 * is saved; the numbers are worked out on the page (core/tools/calculators).
 */
export const dynamic = "force-dynamic";

export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ gold?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  if (!me || me.role === "CLIENT") redirect("/home");
  const { gold } = await searchParams;
  const start = Number(gold);

  return (
    <Page>
      <PageHeader
        title="Calculators"
        description="Gold casting weight per metal, and diamond weight from the size charts. Worked out as you type; nothing is saved."
      />
      <Calculators initialGold={Number.isFinite(start) && start > 0 ? String(start) : ""} />
    </Page>
  );
}
