import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pod lead pages are for the pod lead (QC role) and admins. Everyone else is
 * sent to their own home; the database would return nothing for them anyway.
 */
export async function requireTeam(supabase: SupabaseClient): Promise<{ role: string } | null> {
  await supabase.rpc("ensure_self");
  const [{ data: me }, { data: team }] = await Promise.all([
    supabase.from("users").select("role").maybeSingle(),
    supabase.rpc("i_am_team"),
  ]);
  if (!me || !team) return null;
  return { role: (me as { role: string }).role };
}
