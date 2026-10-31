import { NextResponse, type NextRequest } from "next/server";

import { cronRequestIsAuthorised } from "@/config/cron";
import { dispatchEmails } from "@/lib/email/dispatch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * The email sweep (Phase 17), every 5 minutes from the same schedule as push
 * (.github/workflows/push-dispatch.yml). First it owes the reminders that are
 * due (enqueue_email_reminders, 0054: quote unpaid 24 h, design unreviewed
 * 48 h, feedback 3 days after delivery), then it sends what is waiting:
 * anything an action's own after-response flush missed, and failed sends
 * whose back-off has passed. Safe to overlap (claim_emails skips locked rows)
 * and safe to miss (the outbox keeps everything).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!cronRequestIsAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data: reminders, error } = await createAdminSupabaseClient().rpc("enqueue_email_reminders");
  const outcomes = await dispatchEmails(40);
  return NextResponse.json({
    reminders: error ? `failed: ${error.message}` : reminders,
    sent: outcomes.filter((o) => o.result === "sent").length,
    failed: outcomes.filter((o) => o.result === "failed").length,
  });
}
