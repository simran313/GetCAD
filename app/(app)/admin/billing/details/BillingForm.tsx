"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { saveBillingAction } from "../actions";

export interface BillingSettings {
  legal_name: string;
  cin: string | null;
  address: string;
  gstin: string | null;
  lut_arn: string | null;
  lut_fy: string | null;
  sac_code: string | null;
  invoice_prefix: string;
  bank_transfer: string | null;
  wise_details: string | null;
  paypal_link: string | null;
  invoice_note: string | null;
}

/** The invoice details and the other ways clients may pay (admins edit; finance reads). */
export function BillingForm({ s, editable }: { s: BillingSettings; editable: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = (x: string | null) => x ?? "";

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await saveBillingAction(fd);
          if (!r.ok) return setError(r.error);
          toast("Billing details saved. New invoices use them; issued ones never change.");
          router.refresh();
        });
      }}
    >
      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>On every invoice</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name" htmlFor="b-legal">
              <Input id="b-legal" name="legal_name" required defaultValue={s.legal_name} />
            </Field>
            <Field label="CIN" htmlFor="b-cin">
              <Input id="b-cin" name="cin" defaultValue={v(s.cin)} />
            </Field>
            <Field label="Registered address" htmlFor="b-address" className="sm:col-span-2">
              <Input id="b-address" name="address" required defaultValue={s.address} />
            </Field>
            <Field label="GSTIN" htmlFor="b-gstin" optional hint="Once issued. With it, invoices are titled “Tax invoice”.">
              <Input id="b-gstin" name="gstin" maxLength={15} defaultValue={v(s.gstin)} placeholder="07ABCDE1234F1Z5" />
            </Field>
            <Field label="SAC code" htmlFor="b-sac" hint="Confirm the code with your CA.">
              <Input id="b-sac" name="sac_code" inputMode="numeric" defaultValue={v(s.sac_code)} />
            </Field>
            <Field label="LUT ARN" htmlFor="b-lut" optional hint="The Letter of Undertaking for exports (GST RFD-11), filed each financial year.">
              <Input id="b-lut" name="lut_arn" defaultValue={v(s.lut_arn)} />
            </Field>
            <Field label="LUT year" htmlFor="b-lutfy" optional hint="For example 2026-27.">
              <Input id="b-lutfy" name="lut_fy" defaultValue={v(s.lut_fy)} placeholder="2026-27" />
            </Field>
            <Field label="Invoice prefix" htmlFor="b-prefix" hint="Numbers read PREFIX/2026-27/0001.">
              <Input id="b-prefix" name="invoice_prefix" maxLength={8} defaultValue={s.invoice_prefix} />
            </Field>
            <Field label="Note on invoices" htmlFor="b-note" optional>
              <Input id="b-note" name="invoice_note" maxLength={500} defaultValue={v(s.invoice_note)} placeholder="Thank you for your business." />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Other ways to pay</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-[length:var(--fs-2)] text-muted-foreground">
              Shown to a signed-in client on the pay page, beside card checkout. Leave one empty to hide it. The client can then tell
              you they paid; you confirm with Mark paid on the order when the money arrives.
            </p>
            <Field label="Bank transfer" htmlFor="b-bank" optional hint="Account name, number, IFSC and SWIFT, as your bank gives them for incoming payments.">
              <Textarea id="b-bank" name="bank_transfer" rows={4} maxLength={1000} defaultValue={v(s.bank_transfer)} />
            </Field>
            <Field label="Wise (USD account details)" htmlFor="b-wise" optional hint="Lets US clients pay by ACH from their own bank, usually the cheapest way.">
              <Textarea id="b-wise" name="wise_details" rows={4} maxLength={1000} defaultValue={v(s.wise_details)} />
            </Field>
            <Field label="PayPal link" htmlFor="b-paypal" optional hint="Starts with https://, e.g. your paypal.me link.">
              <Input id="b-paypal" name="paypal_link" maxLength={300} defaultValue={v(s.paypal_link)} />
            </Field>
          </CardBody>
        </Card>
      </fieldset>
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      {editable && <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save billing details"}</Button>}
    </form>
  );
}
