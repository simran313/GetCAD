"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

/**
 * Admin settings (Phase 8b). Both functions check the caller is an admin and
 * write the change to the audit log (set_app_setting, set_feature_flag, 0035).
 */
export async function setSettingAction(formData: FormData): Promise<void> {
  const raw = formData.get("value")?.toString().trim() ?? "";
  // Empty means "not set" (e.g. no metal price estimate); otherwise a whole number.
  if (raw !== "" && !/^\d+$/.test(raw)) throw new Refusal("settings are whole numbers");
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_app_setting", {
    p_key: formData.get("key")?.toString() ?? "",
    p_value: raw === "" ? null : Number(raw),
  });
  refuseOn(error);
  revalidatePath("/admin/settings");
}

export async function setFlagAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_feature_flag", {
    p_key: formData.get("key")?.toString() ?? "",
    p_enabled: formData.get("enabled") === "1",
  });
  refuseOn(error);
  revalidatePath("/admin/settings");
}
