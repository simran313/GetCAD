"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const { error } = await supabase.rpc("save_client_profile", {
    p_business_name: business,
    p_legal_name: name,
    p_email: email,
    p_phone: formData.get("phone")?.toString().trim() || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/home");
  const next = formData.get("next")?.toString() ?? "/account";
  redirect(NEXT.has(next) ? next : "/account");
}
