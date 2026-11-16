import { currentUser } from "@clerk/nextjs/server";
import { Check, Lock } from "lucide-react";

import { ClientProfileForm } from "@/app/(app)/account/ClientProfileForm";
import { WhatsAppButton } from "@/components/support/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { c } from "@/content/claims";
import {
  BUSINESS_TYPES,
  businessTypeLabel,
  gateStep,
  type GateStep,
  type MyVerification,
  PROOF_KINDS,
  PROOF_MAX_FILES,
  proofKindLabel,
  UNLOCKS,
} from "@/core/verification";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { removeVerificationDocumentAction, submitVerificationAction } from "./actions";

/**
 * What a client who is not verified yet sees, on every portal page (0068;
 * owner, 16 Nov 2026). The portal itself (orders, briefs, files, wallet) is
 * not rendered at all until an admin approves the business: one screen, three
 * steps, and the list of what unlocks.
 */
export async function ClientGate() {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("my_client_verification");
  if (error || !data) {
    return (
      <Page form>
        <PageHeader title="We couldn't load your account" description="Refresh the page in a moment, or message us on WhatsApp." />
      </Page>
    );
  }
  const v = data as MyVerification;
  const step = gateStep(v);

  return (
    <Page form>
      <PageHeader
        eyebrow="One step before your portal"
        title={TITLE[step]}
        description={DESCRIPTION[step]}
      />
      {step !== "suspended" && <Steps step={step} />}

      {step === "profile" && <ProfileStep />}
      {step === "business" && <BusinessStep v={v} />}
      {step === "review" && <ReviewStep v={v} />}
      {step === "suspended" && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-[length:var(--fs-3)]">Message us and we&apos;ll sort it out.</p>
            <WhatsAppButton label="WhatsApp us" text="Hi, my account is paused. Can you help?" />
          </CardBody>
        </Card>
      )}

      {step !== "suspended" && <Unlocks />}
    </Page>
  );
}

const TITLE: Record<GateStep, string> = {
  profile: "Tell us who you are",
  business: "Verify your business",
  review: "We're checking your business",
  suspended: "Your account is paused",
};

const DESCRIPTION: Record<GateStep, string> = {
  profile: "We work only with jewelry businesses. Start with your name and the business name.",
  business:
    "Add the business details and one proof that it is registered. Our team checks it, then every feature below unlocks.",
  review: `We'll email you as soon as it's approved, usually within our support hours (${c("LIVE_CALL_HOURS")}).`,
  suspended: "Ordering is paused on this account.",
};

function Steps({ step }: { step: GateStep }) {
  const order: GateStep[] = ["profile", "business", "review"];
  const at = order.indexOf(step);
  const names = ["Your details", "Your business", "Review"];
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Verification steps">
      {names.map((n, i) => (
        <li
          key={n}
          aria-current={i === at ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-[length:var(--fs-2)]",
            i === at ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-full)] border text-[length:var(--fs-1)]",
              i < at ? "border-foreground bg-foreground text-background" : i === at ? "border-foreground" : "border-border",
            )}
          >
            {i < at ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          {n}
        </li>
      ))}
    </ol>
  );
}

async function ProfileStep() {
  const user = await currentUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
      </CardHeader>
      <CardBody>
        <ClientProfileForm
          profile={null}
          email={user?.primaryEmailAddress?.emailAddress ?? null}
          next="/home"
          submitLabel="Continue"
          askHeardAbout
        />
      </CardBody>
    </Card>
  );
}

function BusinessStep({ v }: { v: MyVerification }) {
  const hasProof = v.documents.length > 0;
  const room = PROOF_MAX_FILES - v.documents.length;
  return (
    <>
      {v.state === "REJECTED" && v.decision_reason && (
        <div role="alert" className="rounded-[var(--r-lg)] border border-border bg-[color:var(--tone-danger-bg)] p-[var(--s-5)] text-[color:var(--tone-danger-fg)]">
          <p className="font-medium">We couldn&apos;t verify the business yet</p>
          <p className="mt-1 text-[length:var(--fs-3)]">{v.decision_reason}</p>
        </div>
      )}

      {hasProof && (
        <Card>
          <CardHeader>
            <CardTitle>Proof on file</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-border">
              {v.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-3)]">{d.file_name}</span>
                    <span className="block text-[length:var(--fs-2)] text-muted-foreground">{proofKindLabel(d.kind)}</span>
                  </span>
                  <form action={removeVerificationDocumentAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your business</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={submitVerificationAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="What kind of business is it?" htmlFor="business_type" className="sm:col-span-2">
              <Select id="business_type" name="business_type" required defaultValue={v.business_type ?? ""}>
                <option value="" disabled>
                  Choose one
                </option>
                {BUSINESS_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Country of registration" htmlFor="country">
              <Input id="country" name="country" required maxLength={60} defaultValue={v.country ?? "United States"} />
            </Field>
            <Field label="Website or Instagram" htmlFor="website" hint="For example example.com or @examplejewels">
              <Input id="website" name="website" required maxLength={300} defaultValue={v.website ?? ""} />
            </Field>
            <Field label="Business address" htmlFor="address" className="sm:col-span-2">
              <Input id="address" name="address" required maxLength={400} defaultValue={v.address ?? ""} autoComplete="street-address" />
            </Field>
            <Field label="Your role in the business" htmlFor="role_title" optional>
              <Input id="role_title" name="role_title" maxLength={80} defaultValue={v.role_title ?? ""} placeholder="Owner, buyer, CAD manager…" />
            </Field>

            <fieldset className="grid gap-4 border-t border-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="mb-1 text-[length:var(--fs-3)] font-medium">
                {hasProof ? "Add another proof (optional)" : "Proof that the business is registered"}
              </legend>
              {room > 0 ? (
                <>
                  <Field label="What is it?" htmlFor="proof_kind">
                    <Select id="proof_kind" name="proof_kind" required={!hasProof} defaultValue="">
                      <option value="" disabled>
                        Choose one
                      </option>
                      {PROOF_KINDS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="File" htmlFor="proofs" hint="PDF, JPG, PNG or WebP, up to 10 MB. Only our admins can open it.">
                    <FilePicker id="proofs" name="proofs" label="Proof file" accept=".pdf,image/jpeg,image/png,image/webp" required={!hasProof} multiple />
                  </Field>
                </>
              ) : (
                <p className="text-[length:var(--fs-2)] text-muted-foreground sm:col-span-2">Five documents is the most; remove one to add another.</p>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit">Submit for verification</Button>
              <span className="text-[length:var(--fs-2)] text-muted-foreground">
                <Lock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                Private: only our admins see this.
              </span>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}

function ReviewStep({ v }: { v: MyVerification }) {
  const rows: [string, string][] = [
    ["Business", businessTypeLabel(v.business_type)],
    ["Country", v.country ?? "—"],
    ["Address", v.address ?? "—"],
    ["Website", v.website ?? "—"],
    ["Proof on file", `${v.documents.length} ${v.documents.length === 1 ? "document" : "documents"}`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          What you sent <StatusPill tone="attention">Under review</StatusPill>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
          {rows.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-[length:var(--fs-2)] text-muted-foreground">{k}</dt>
              <dd className="text-[length:var(--fs-3)] [overflow-wrap:anywhere]">{val}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppButton label="WhatsApp us to speed it up" text="Hi, I've submitted my business for verification." />
        </div>
      </CardBody>
    </Card>
  );
}

function Unlocks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlocks once you&apos;re verified</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="grid gap-4 sm:grid-cols-2">
          {UNLOCKS.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <Lock className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-[length:var(--fs-3)] font-medium">{title}</span>
                <span className="block text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 border-t border-border pt-4 text-[length:var(--fs-2)] text-muted-foreground">
          Why we verify: we work only with jewelry businesses, and every design you send stays confidential. Checking each
          business keeps it that way.
        </p>
      </CardBody>
    </Card>
  );
}
