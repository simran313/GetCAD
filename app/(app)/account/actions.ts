"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { decodeFirstTouch, FIRST_TOUCH_COOKIE, isHeardAbout } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";

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
  if (!business || !name || !email) throw new Error("business name, your name and email are required");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  // Asked once, when the profile is first made (A9.8): required here, not
  // only by the browser.
  const heard = formData.get("heard_about")?.toString() ?? "";
  const { data: existing } = await supabase.from("client_profiles").select("id").maybeSingle();
  if (!existing && !heard) throw new Error("tell us how you heard about us");

  const { error } = await supabase.rpc("save_client_profile", {
    p_business_name: business,
    p_legal_name: name,
    p_email: email,
    p_phone: formData.get("phone")?.toString().trim() || null,
  });
  if (error) throw new Error(error.message);

  // S3 asks once how they found us; the first-touch cookie says where they
  // landed (Phase 6, 0049). Kept only the first time.
  if (heard) {
    if (!isHeardAbout(heard)) throw new Error("tell us how you heard about us");
    const touch = decodeFirstTouch((await cookies()).get(FIRST_TOUCH_COOKIE)?.value);
    const { error: attrError } = await supabase.rpc("save_attribution", {
      p_heard_about: heard,
      p_first_touch: touch ?? {},
    });
    if (attrError) throw new Error(attrError.message);
  }

  revalidatePath("/account");
  revalidatePath("/home");
  const next = formData.get("next")?.toString() ?? "/account";
  redirect(NEXT.has(next) ? next : "/account");
}
