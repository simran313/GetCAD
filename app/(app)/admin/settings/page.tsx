import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/status-tag";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/work/team";

import { setFlagAction, setSettingAction } from "./actions";

/**
 * A11 — Settings (Phase 8b). The numbers the platform runs on (densities,
 * minimums, the FX rate, clocks, windows) and the feature switches, editable
 * by an admin instead of by SQL. Every change is audited by the database.
 * Pod leads see them read-only.
 */
export const dynamic = "force-dynamic";

interface Setting {
  key: string;
  value: number | null;
  description: string | null;
}
interface Flag {
  key: string;
  enabled: boolean;
  description: string | null;
}

const GROUPS: [string, (key: string) => boolean][] = [
  ["Weights", (k) => k.startsWith("density_") || k === "metal_price_cents_per_gram"],
  ["Spec sheet", (k) => k.startsWith("min_")],
  ["Money", (k) => k === "usd_inr_paise_per_usd" || k === "payout_warning_pct"],
  ["Clocks and windows", () => true],
];

/** How to read a stored whole number, from its key. */
function unit(key: string): string {
  if (key.endsWith("_mg_cm3")) return "mg/cm³ — 13100 is 13.1 g/cm³";
  if (key.endsWith("_um")) return "µm — 800 is 0.8 mm";
  if (key.endsWith("_pct")) return "%";
  if (key.endsWith("_paise_per_usd")) return "paise per $1 — 8400 is ₹84.00";
  if (key.endsWith("_cents_per_gram")) return "US cents per gram — empty for no estimate";
  if (key.endsWith("_days")) return "days";
  if (key.endsWith("_hours")) return "hours";
  if (key.endsWith("_minutes")) return "minutes";
  return "";
}

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  if (!team) redirect("/home");

  const [{ data: settings }, { data: flags }, { data: grants }] = await Promise.all([
    supabase.from("app_settings").select("key, value, description").order("key"),
    supabase.from("feature_flags").select("key, enabled, description").order("key"),
    supabase.from("user_roles").select("role"),
  ]);
  const roles = new Set([team.role, ...((grants ?? []) as { role: string }[]).map((g) => g.role)]);
  const isAdmin = ["SALES", "OPS", "FINANCE"].every((r) => roles.has(r));

  const rows = (settings ?? []) as Setting[];
  const seen = new Set<string>();
  const grouped = GROUPS.map(([name, test]) => {
    const inGroup = rows.filter((r) => !seen.has(r.key) && test(r.key));
    inGroup.forEach((r) => seen.add(r.key));
    return [name, inGroup] as const;
  });

  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "The numbers the platform runs on. A change applies from now on and is recorded in the audit log."
            : "Read-only: an admin (Sales + Ops + Finance) can change these."
        }
      />

      {grouped.map(([name, items]) =>
        items.length === 0 ? null : (
          <Card as="section" key={name}>
            <CardHeader>
              <CardTitle>{name}</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <li key={s.key} className="flex flex-wrap items-end justify-between gap-3 px-[var(--s-5)] py-[var(--s-3)]">
                  <div className="min-w-0">
                    <p className="text-[length:var(--fs-3)] font-medium">{s.description ?? s.key}</p>
                    <p className="font-mono text-[length:var(--fs-1)] text-muted-foreground">
                      {s.key}
                      {unit(s.key) ? ` · ${unit(s.key)}` : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <form action={setSettingAction} className="flex items-end gap-2">
                      <input type="hidden" name="key" value={s.key} />
                      <Input
                        name="value"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        defaultValue={s.value ?? ""}
                        aria-label={s.description ?? s.key}
                        className="w-32 text-right tabular"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <span className="tabular font-mono text-[length:var(--fs-3)]">{s.value ?? "—"}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ),
      )}

      <Card as="section">
        <CardHeader>
          <CardTitle>Feature switches</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-border">
          {((flags ?? []) as Flag[]).map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-[var(--s-5)] py-[var(--s-3)]">
              <div className="min-w-0">
                <p className="text-[length:var(--fs-3)] font-medium">{f.description ?? f.key}</p>
                <p className="font-mono text-[length:var(--fs-1)] text-muted-foreground">{f.key}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusTag kind={f.enabled ? "done" : "muted"}>{f.enabled ? "On" : "Off"}</StatusTag>
                {isAdmin && (
                  <form action={setFlagAction}>
                    <input type="hidden" name="key" value={f.key} />
                    <input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
                    <Button type="submit" size="sm" variant="outline" aria-label={`${f.enabled ? "Turn off" : "Turn on"} ${f.key}`}>
                      {f.enabled ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
