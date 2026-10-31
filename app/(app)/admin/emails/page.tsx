import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { emailDelivery, isEmailConfigured } from "@/config/email";
import { EMAIL_CATALOG, renderEmail, type EmailTemplate } from "@/core";
import { samplePayloads } from "@/core/email/samples";
import { SITE_URL } from "@/lib/seo";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/work/team";

import { SendTests } from "./SendTests";

/**
 * Email previews (Phase 17): every email the platform sends, rendered with
 * sample data exactly as a mail app receives it, what sends it, and whether a
 * client can turn it off. Admins can send the whole set to the test inbox.
 */
export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const team = await requireTeam(supabase);
  if (!team) redirect("/home");

  const { data: grants } = await supabase.from("user_roles").select("role");
  const roles = new Set([team.role, ...((grants ?? []) as { role: string }[]).map((g) => g.role)]);
  const isAdmin = ["SALES", "OPS", "FINANCE"].every((r) => roles.has(r));
  const delivery = emailDelivery();
  const site = SITE_URL.startsWith("https://") ? SITE_URL : "https://thecadpillar.com";
  const samples = samplePayloads(site);
  return (
    <Page>
      <PageHeader
        eyebrow="System"
        title="Emails"
        description={
          delivery.live
            ? "Live: emails go to their real recipients."
            : `Test mode: every email goes to ${delivery.testTo}, with the real recipient in the subject. Clients receive nothing until EMAIL_DELIVERY=live.`
        }
        actions={isAdmin && isEmailConfigured() ? <SendTests count={EMAIL_CATALOG.length} to={delivery.testTo} /> : undefined}
      />
      <ul className="space-y-3">
        {EMAIL_CATALOG.map((e, i) => {
          const r = renderEmail(e.template as EmailTemplate, samples[e.template] as never);
          return (
            <li key={e.template}>
              <Card className="overflow-hidden">
                <details open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-[var(--s-4)]">
                    <span className="min-w-0">
                      <span className="block text-[length:var(--fs-3)] font-medium">{r.subject}</span>
                      <span className="mt-0.5 block text-[length:var(--fs-2)] text-muted-foreground">
                        {e.audience} · {e.when}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-[var(--r-full)] border border-border px-2.5 py-0.5 text-[length:var(--fs-1)] text-muted-foreground">
                      {e.kind === "optional" ? "Can turn off" : "Always sent"}
                    </span>
                  </summary>
                  {/* Not sandboxed: the HTML is built here from fixed sample data and holds
                      no script; a sandbox only made the browser log blocked scripts
                      (the e2e pre-launch pass fails on any console error). */}
                  <iframe title={`Preview: ${r.subject}`} srcDoc={r.html} className="h-[720px] w-full border-t border-border bg-white" />
                </details>
              </Card>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
