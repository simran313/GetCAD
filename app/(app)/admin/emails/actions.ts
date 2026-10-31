"use server";

import { auth } from "@clerk/nextjs/server";

import { emailDelivery } from "@/config/email";
import { EMAIL_TEMPLATES } from "@/core";
import { samplePayloads } from "@/core/email/samples";
import { dispatchEmails } from "@/lib/email/dispatch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal } from "@/lib/refusal";
import { requireTeam } from "@/lib/work/team";

/**
 * Send every email, with sample data, to the test inbox (Phase 17). Admin
 * only. Each goes through the real outbox and dispatcher, so this tests the
 * provider, the rendering in real mail apps and the delivery records too.
 */
export async function sendTestEmailsAction(): Promise<{ sent: number; failed: number; to: string }> {
  const { userId } = await auth();
  if (!userId) throw new Refusal("not authenticated");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  const { data: grants } = await supabase.from("user_roles").select("role");
  const roles = new Set([team?.role, ...((grants ?? []) as { role: string }[]).map((g) => g.role)]);
  // The same admin test as Settings: all three office roles.
  if (!team || !["SALES", "OPS", "FINANCE"].every((r) => roles.has(r))) throw new Refusal("only an admin can send test emails");

  const to = emailDelivery().testTo;
  const stamp = Date.now();
  // The dispatcher adds the site address; samples carry none of their own.
  const samples = samplePayloads("") as unknown as Record<string, Record<string, unknown>>;
  const rows = EMAIL_TEMPLATES.map((template) => {
    const { site_url: _ignored, ...payload } = samples[template] ?? {};
    return { template, recipient_email: to, payload, idempotency_key: `email:test:${template}:${stamp}` };
  });
  const { error } = await createAdminSupabaseClient().from("email_outbox").insert(rows);
  if (error) throw new Error(error.message);
  const outcomes = await dispatchEmails(EMAIL_TEMPLATES.length);
  return { sent: outcomes.filter((o) => o.result === "sent").length, failed: outcomes.filter((o) => o.result === "failed").length, to };
}
