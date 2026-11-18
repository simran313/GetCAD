import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/work/team";

import { type BillingSettings, BillingForm } from "./BillingForm";

export const dynamic = "force-dynamic";

/** Billing details (0072): what invoices print and how else clients can pay. */
export default async function BillingDetailsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  if (!team) redirect("/home");
  const [settings, grants] = await Promise.all([supabase.rpc("billing_settings_get"), supabase.from("user_roles").select("role")]);
  const roles = new Set([team.role, ...((grants.data ?? []) as { role: string }[]).map((g) => g.role)]);
  const isAdmin = ["SALES", "OPS", "FINANCE"].every((r) => roles.has(r));
  if (settings.error) {
    return (
      <Page>
        <PageHeader title="Billing details" />
        <ErrorPanel title="Not available to your role" message={settings.error.message} className="mt-4" />
      </Page>
    );
  }
  return (
    <Page form>
      <PageHeader
        eyebrow="Billing"
        title="Billing details"
        description="What every invoice prints, and the other ways a client can pay. Issued invoices never change."
      />
      <BillingForm s={settings.data as BillingSettings} editable={isAdmin} />
    </Page>
  );
}
