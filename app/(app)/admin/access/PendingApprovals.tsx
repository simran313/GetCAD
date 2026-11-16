import { FileText, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { businessTypeLabel, proofKindLabel } from "@/core/verification";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { approveClientAction, declineClientAction } from "./actions";

/**
 * Clients waiting for approval (0068; owner, 16 Nov 2026), in their own
 * section above the accounts table: what the business told us, its proofs
 * (each open is an audited identity read), and Approve or Decline with a
 * reason. Admins only; the database refuses anyone else.
 */
interface Pending {
  user_id: string;
  created_at: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  state: "SUBMITTED" | "REJECTED" | "NOT_SUBMITTED" | "APPROVED";
  business_type: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  role_title: string | null;
  submitted_at: string | null;
  decision_reason: string | null;
  documents: number;
}
interface Doc {
  id: string;
  kind: string;
  file_name: string;
}

const STATE: Record<Pending["state"], [string, "warning" | "neutral" | "danger" | "success"]> = {
  SUBMITTED: ["Ready to review", "warning"],
  NOT_SUBMITTED: ["Not submitted yet", "neutral"],
  REJECTED: ["Declined, may resubmit", "danger"],
  APPROVED: ["Approved", "success"],
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET" : "—";

function websiteHref(raw: string): string | null {
  const s = raw.trim();
  if (s.startsWith("@")) return `https://www.instagram.com/${encodeURIComponent(s.slice(1))}/`;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export async function PendingApprovals() {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("admin_client_verifications");
  if (error) return null; // not an admin: the database said no; the accounts table below still shows
  const rows = (data ?? []) as Pending[];

  const docs = new Map<string, Doc[]>();
  await Promise.all(
    rows
      .filter((r) => r.documents > 0)
      .map(async (r) => {
        const { data: d } = await supabase.rpc("client_verification_documents_for", { p_user_id: r.user_id });
        docs.set(r.user_id, (d ?? []) as Doc[]);
      }),
  );
  const ready = rows.filter((r) => r.state === "SUBMITTED").length;

  return (
    <section id="pending" aria-labelledby="pending-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pending-title" className="text-[length:var(--fs-5)] font-medium">
          Waiting for approval{" "}
          <span className="tabular rounded-[var(--r-full)] bg-muted px-2 text-[length:var(--fs-2)] text-muted-foreground">{rows.length}</span>
        </h2>
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          {ready > 0 ? `${ready} ready to review. ` : ""}New client accounts see only the verification screen until you approve them.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-[length:var(--fs-3)] text-muted-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden /> No one is waiting. New sign-ups appear here.
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const [label, tone] = STATE[r.state];
            const href = r.website ? websiteHref(r.website) : null;
            const facts: [string, React.ReactNode][] = [
              ["Contact", [r.contact_name, r.email, r.phone].filter(Boolean).join(" · ") || "—"],
              ["Business", r.business_type ? businessTypeLabel(r.business_type) : "—"],
              ["Role", r.role_title ?? "—"],
              ["Country", r.country ?? "—"],
              ["Address", r.address ?? "—"],
              [
                "Website",
                r.website ? (
                  href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                      {r.website}
                    </a>
                  ) : (
                    r.website
                  )
                ) : (
                  "—"
                ),
              ],
              ["Signed up", when(r.created_at)],
              ["Submitted", when(r.submitted_at)],
            ];
            return (
              <li key={r.user_id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-3">
                      {r.business_name ?? r.email ?? "No business name yet"}
                      <StatusPill tone={tone}>{label}</StatusPill>
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[120px_1fr]">
                      {facts.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-[length:var(--fs-2)] text-muted-foreground">{k}</dt>
                          <dd className="text-[length:var(--fs-3)] [overflow-wrap:anywhere]">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    <div>
                      <p className="text-[length:var(--fs-2)] text-muted-foreground">Proof of registration</p>
                      {(docs.get(r.user_id) ?? []).length === 0 ? (
                        <p className="text-[length:var(--fs-3)]">None uploaded yet.</p>
                      ) : (
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {(docs.get(r.user_id) ?? []).map((d) => (
                            <li key={d.id}>
                              <a
                                href={`/api/client-verification/${d.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-[var(--ctl-sm)] items-center gap-2 rounded-[var(--r-sm)] border border-border px-3 text-[length:var(--fs-2)] hover:bg-accent"
                                title={proofKindLabel(d.kind)}
                              >
                                <FileText className="h-4 w-4" aria-hidden />
                                {d.file_name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-[length:var(--fs-1)] text-muted-foreground">Opening a document is recorded in the audit log.</p>
                    </div>

                    {r.state === "REJECTED" && r.decision_reason && (
                      <p className="text-[length:var(--fs-2)] text-muted-foreground">Last declined: {r.decision_reason}</p>
                    )}

                    <div className="flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-end">
                      <form action={approveClientAction}>
                        <input type="hidden" name="user_id" value={r.user_id} />
                        <Button type="submit" aria-label={`Approve ${r.business_name ?? r.email ?? "this account"}`}>
                          Approve
                        </Button>
                      </form>
                      {r.state === "SUBMITTED" && (
                        <form action={declineClientAction} className="flex flex-1 flex-col gap-2 sm:flex-row">
                          <input type="hidden" name="user_id" value={r.user_id} />
                          <Input
                            name="reason"
                            required
                            minLength={5}
                            maxLength={500}
                            placeholder="Why, so they know what to send (the client sees this)"
                            aria-label={`Reason to decline ${r.business_name ?? r.email ?? "this account"}`}
                          />
                          <Button type="submit" variant="outline">
                            Decline
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
