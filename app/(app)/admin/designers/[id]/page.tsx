import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatDay } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Checkbox, Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

import { removeDocumentAction, saveBankAction, setDesignerPodAction, setDesignerRateAction, uploadDocumentsAction } from "../actions";
import { BankReveal } from "../BankReveal";
import { ReloadForm } from "@/components/reload-form";
import { bankWord, DOCUMENT_KINDS, statusWord, type DesignerRow } from "../words";

/**
 * One designer, for admins (owner, 4 Nov 2026): how they sign in, their pod
 * (its lead then sees and assigns them), their pay rate (0065: the pod lead
 * sees it, the designer never does), bank details, identity documents.
 * Bank details show in full only on "Show in full" (read on the press), and that read is
 * written to the audit log; so is every document opened.
 */
export const dynamic = "force-dynamic";

interface Doc {
  id: string;
  kind: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

const kindWord = new Map(DOCUMENT_KINDS);
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function DesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const tz = await viewerZone();
  const supabase = await createUserSupabaseClient();

  const list = await supabase.rpc("admin_designers");
  if (list.error) {
    return (
      <Page>
        <PageHeader title="Designer" />
        <ErrorPanel title="Not available to your role" message={list.error.message} className="mt-4" />
      </Page>
    );
  }
  const d = ((list.data ?? []) as DesignerRow[]).find((r) => r.user_id === id);
  if (!d) notFound();

  const [docsRes, podsRes, rateRes] = await Promise.all([
    supabase.rpc("designer_documents_for", { p_user_id: id }),
    supabase.rpc("pods_overview"),
    supabase.rpc("team_designer_rates"),
  ]);
  const rate = ((rateRes.data ?? []) as { designer_id: string; paise_per_minute: number; is_custom: boolean; standard_paise_per_minute: number }[]).find(
    (r) => r.designer_id === id,
  );
  const perMinute = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const docs = (docsRes.data ?? []) as Doc[];
  const pods = (podsRes.data ?? []) as { pod_id: string; name: string; lead_name: string | null }[];
  const status = statusWord(d);
  const bankState = bankWord(d);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/admin/designers" className="underline-offset-4 hover:underline">
            ← Designers
          </Link>
        }
        title={d.legal_name}
        description={`${d.email}${d.phone ? ` · ${d.phone}` : ""}${d.designer_ref ? ` · ${d.designer_ref}` : ""}`}
        actions={<StatusPill tone={status.tone}>{status.word}</StatusPill>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sign-in</CardTitle>
        </CardHeader>
        <CardBody className="space-y-1 text-[length:var(--fs-2)]">
          {d.agreement_signed ? (
            <p>Signed in and signed the designer agreement. They can be assigned jobs.</p>
          ) : (
            <>
              <p>
                Send them this: sign in at <span className="font-medium">thecadpillar.com/sign-in</span> with{" "}
                <span className="font-medium">{d.email}</span>. A code arrives by email. Then sign the designer agreement.
              </p>
              <p className="text-muted-foreground">Until they sign it, their pod lead can see them but cannot assign them jobs.</p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pod</CardTitle>
        </CardHeader>
        <CardBody>
          <ReloadForm action={setDesignerPodAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="user_id" value={id} />
            <Field label="Pod lead who sees and assigns this designer" htmlFor="pod_id" className="min-w-64 flex-1">
              <Select id="pod_id" name="pod_id" defaultValue={d.pod_id ?? ""}>
                <option value="">Not in a pod</option>
                {pods.map((p) => (
                  <option key={p.pod_id} value={p.pod_id}>
                    {p.name}
                    {p.lead_name ? ` · led by ${p.lead_name}` : " · no lead yet"}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline">
              Save
            </Button>
          </ReloadForm>
          <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">
            New pod or lead: <Link href="/admin/access/pods" className="underline underline-offset-4">Pods</Link>.
          </p>
        </CardBody>
      </Card>

      {rate && (
        <Card>
          <CardHeader>
            <CardTitle>Pay rate</CardTitle>
            <StatusPill tone={rate.is_custom ? "info" : "neutral"}>{rate.is_custom ? "Own rate" : "Standard"}</StatusPill>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-[length:var(--fs-3)]">
              <span className="tabular font-mono font-medium">{perMinute(rate.paise_per_minute)}</span> a minute of category time
              <span className="text-muted-foreground"> · a 60-minute job pays {`₹${Math.round((rate.paise_per_minute * 60) / 100).toLocaleString("en-IN")}`}</span>
            </p>
            <ReloadForm action={setDesignerRateAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="user_id" value={id} />
              <Field label="Rupees a minute" htmlFor="rupees_per_minute">
                <Input
                  id="rupees_per_minute"
                  name="rupees_per_minute"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  className="w-32"
                  defaultValue={(rate.paise_per_minute / 100).toFixed(2)}
                />
              </Field>
              <Button type="submit" variant="outline">
                Save rate
              </Button>
              {rate.is_custom && (
                <Button type="submit" name="standard" value="1" variant="ghost">
                  Back to standard ({perMinute(rate.standard_paise_per_minute)})
                </Button>
              )}
            </ReloadForm>
            <p className="text-[length:var(--fs-2)] text-muted-foreground">
              Reaches jobs assigned after it. Their pod lead sees this rate; the designer never does, only what each job pays.
              The standard rate is in <Link href="/admin/settings" className="underline underline-offset-4">Settings</Link>.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <StatusPill tone={bankState.tone}>{bankState.word}</StatusPill>
        </CardHeader>
        <CardBody className="space-y-4">
          {d.payout_status && <BankReveal userId={id} />}
          <ReloadForm action={saveBankAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="user_id" value={id} />
            <Field label="Name at the bank" htmlFor="beneficiary_name">
              <Input id="beneficiary_name" name="beneficiary_name" required defaultValue={d.legal_name} />
            </Field>
            <Field label="PAN" htmlFor="pan">
              <Input id="pan" name="pan" required autoComplete="off" placeholder="ABCDE1234F" />
            </Field>
            <Field label="Account number" htmlFor="account_number">
              <Input id="account_number" name="account_number" required inputMode="numeric" autoComplete="off" />
            </Field>
            <Field label="IFSC" htmlFor="ifsc">
              <Input id="ifsc" name="ifsc" required autoComplete="off" placeholder="SBIN0001234" />
            </Field>
            <Field label="Account type" htmlFor="account_type">
              <Select id="account_type" name="account_type" defaultValue="SAVINGS">
                <option value="SAVINGS">Savings</option>
                <option value="CURRENT">Current</option>
              </Select>
            </Field>
            <label className="flex min-h-[var(--ctl)] items-center gap-3 self-end text-[length:var(--fs-2)]">
              <Checkbox name="verified" />
              Checked against the bank proof and PAN card
            </label>
            <div className="sm:col-span-2">
              <Button type="submit">{d.payout_status ? "Replace bank details" : "Save bank details"}</Button>
            </div>
          </ReloadForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <ReloadForm action={uploadDocumentsAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="user_id" value={id} />
            <Field label="What it is" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="PAN_CARD">
                {DOCUMENT_KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Files (JPG, PNG, WebP or PDF, up to 10 MB each)" htmlFor="files" className="min-w-64 flex-1">
              <Input id="files" name="files" type="file" multiple required accept="image/jpeg,image/png,image/webp,application/pdf" />
            </Field>
            <Button type="submit" variant="outline">
              Upload
            </Button>
          </ReloadForm>
          <p className="text-[length:var(--fs-2)] text-muted-foreground">
            Aadhaar: keep the masked copy (only the last 4 digits showing). The designer can download it from UIDAI&apos;s site.
          </p>
          {docs.length === 0 ? (
            <p className="text-[length:var(--fs-2)] text-muted-foreground">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-[var(--r-md)] border border-border">
              {docs.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-[var(--s-3)] py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{kindWord.get(doc.kind) ?? doc.kind}</span>
                    <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">
                      {doc.file_name} · {size(doc.size_bytes)} · {formatDay(doc.created_at, tz)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <a href={`/api/designer-documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-[length:var(--fs-2)] underline underline-offset-4">
                      Open
                    </a>
                    <ReloadForm action={removeDocumentAction}>
                      <input type="hidden" name="user_id" value={id} />
                      <input type="hidden" name="document_id" value={doc.id} />
                      <Button type="submit" size="sm" variant="ghost" aria-label={`Remove ${doc.file_name}`}>
                        Remove
                      </Button>
                    </ReloadForm>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}
