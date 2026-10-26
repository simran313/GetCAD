import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/work/team";

import { SECTIONS } from "./fields";
import { SettingsForm, type Changed, type FlagRow, type SettingRow } from "./SettingsForm";
import { viewerZone } from "@/lib/time/zone";
import { formatDate } from "@/core";

/**
 * A11 — Settings (Phase 8b, redesigned). The numbers the platform runs on
 * (densities, minimums, the FX rate, clocks, windows) and the feature
 * switches, editable by an admin instead of by SQL. Every change is audited
 * by the database; each section says who changed it last (updated_by and
 * updated_at on the row itself). Pod leads see them read-only.
 */
export const dynamic = "force-dynamic";

interface Stamped {
  key: string;
  updated_by: string | null;
  updated_at: string;
}


export default async function SettingsPage() {
  const { userId } = await auth();
  const tz = await viewerZone();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  if (!team) redirect("/home");

  const [{ data: settings }, { data: flags }, { data: grants }] = await Promise.all([
    supabase.from("app_settings").select("key, value, description, updated_by, updated_at").order("key"),
    supabase.from("feature_flags").select("key, enabled, description, updated_by, updated_at").order("key"),
    supabase.from("user_roles").select("role"),
  ]);
  const roles = new Set([team.role, ...((grants ?? []) as { role: string }[]).map((g) => g.role)]);
  const isAdmin = ["SALES", "OPS", "FINANCE"].every((r) => roles.has(r));

  const settingRows = (settings ?? []) as (SettingRow & Stamped)[];
  const flagRows = (flags ?? []) as (FlagRow & Stamped)[];

  // Who changed it: "you", a staff first name where the viewer may read it,
  // otherwise "an admin". Rows never changed carry no updated_by.
  const ids = [...new Set([...settingRows, ...flagRows].map((r) => r.updated_by).filter((v): v is string => !!v && v !== userId))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("staff_profiles").select("user_id, first_name").in("user_id", ids);
    for (const p of (data ?? []) as { user_id: string; first_name: string | null }[]) if (p.first_name) names.set(p.user_id, p.first_name);
  }
  const latest = (rows: Stamped[]): Changed | undefined => {
    const r = rows.filter((x) => x.updated_by).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (!r) return undefined;
    return { by: r.updated_by === userId ? "you" : (names.get(r.updated_by!) ?? "an admin"), at: formatDate(r.updated_at, tz) };
  };
  const changed: Record<string, Changed | undefined> = {
    ...Object.fromEntries(SECTIONS.map((s) => [s.id, latest(settingRows.filter((r) => s.keys.includes(r.key)))])),
    flags: latest(flagRows),
  };

  return (
    <Page form>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "The numbers the platform runs on. Changes apply from now on and are recorded in the audit log."
            : "Read-only. An admin (Sales + Ops + Finance) can change these."
        }
      />
      <SettingsForm
        settings={settingRows.map(({ key, value, description }) => ({ key, value, description }))}
        flags={flagRows.map(({ key, enabled, description }) => ({ key, enabled, description }))}
        changed={changed}
        editable={isAdmin}
      />
    </Page>
  );
}
