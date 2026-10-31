"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { decodeFirstTouch, FIRST_TOUCH_COOKIE, isHeardAbout } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";
import { flushEmailsAfterResponse } from "@/lib/email/dispatch";

const NEXT = new Set(["/welcome", "/account", "/home", "/orders/new"]);

/**
 * Save who the client is (S3 Welcome, C9 Account). save_client_profile()
 * checks the role and mints the client code from the business name the first
 * time (0035).
 */
export async function saveClientProfileAction(formData: FormData): Promise<void> {
  const business = formData.get("business_name")?.toString().trim() ?? "";
  const name = formData.get("legal_name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  if (!business || !name || !email) throw new Refusal("business name, your name and email are required");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  // Asked once, when the profile is first made (A9.8): required here, not
  // only by the browser.
  const heard = formData.get("heard_about")?.toString() ?? "";
  const { data: existing } = await supabase.from("client_profiles").select("id").maybeSingle();
  if (!existing && !heard) throw new Refusal("tell us how you heard about us");

  const { error } = await supabase.rpc("save_client_profile", {
    p_business_name: business,
    p_legal_name: name,
    p_email: email,
    p_phone: formData.get("phone")?.toString().trim() || null,
  });
  refuseOn(error);

  // S3 asks once how they found us; the first-touch cookie says where they
  // landed (Phase 6, 0049). Kept only the first time.
  if (heard) {
    if (!isHeardAbout(heard)) throw new Refusal("tell us how you heard about us");
    const touch = decodeFirstTouch((await cookies()).get(FIRST_TOUCH_COOKIE)?.value);
    const { error: attrError } = await supabase.rpc("save_attribution", {
      p_heard_about: heard,
      p_first_touch: touch ?? {},
    });
    refuseOn(attrError);
  }

  revalidatePath("/account");
  flushEmailsAfterResponse();
  revalidatePath("/home");
  flushEmailsAfterResponse();
  const next = formData.get("next")?.toString() ?? "/account";
  redirect(NEXT.has(next) ? next : "/account");
}

/** Optional emails (Phase 17): messages, reminders, news. Order emails always go. */
export async function saveEmailPreferencesAction(prefs: { messages: boolean; reminders: boolean; marketing: boolean }): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_email_preferences", {
    p_messages: prefs.messages === true,
    p_reminders: prefs.reminders === true,
    p_marketing: prefs.marketing === true,
  });
  refuseOn(error);
}
