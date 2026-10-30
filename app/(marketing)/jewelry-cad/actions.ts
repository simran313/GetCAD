"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { generateId } from "@/core";
import { CONTACT_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

/**
 * /jewelry-cad's three-field brief (LANDING-COPY). The piece and email
 * become a lead the team prices within the hour (start_brief_lead, 0049),
 * the funnel records brief_started, and the visitor goes on to create their
 * account with the email filled in, where they add the sketch or photo.
 * Pictures are never taken from someone without an account.
 */
export async function startBriefLeadAction(formData: FormData): Promise<void> {
  const product = formData.get("product")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  const note = formData.get("note")?.toString().trim() || null;

  const { userId } = await auth();
  if (userId) redirect("/orders/new");

  const allowed = await checkRateLimit(CONTACT_LIMIT.scope, CONTACT_LIMIT.max, CONTACT_LIMIT.windowSeconds);
  if (!allowed) throw new Refusal("Too many requests from this network. Please try again later.");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("start_brief_lead", { p_email: email, p_product: product, p_note: note });
  refuseOn(error);
  await supabase.rpc("record_marketing_event", {
    p_event: "brief_started",
    p_visitor_id: generateId(),
    p_props: { product, from: "jewelry-cad" },
  });

  redirect(`/sign-up?${new URLSearchParams({ email })}`);
}
