"use client";

import { useState, useTransition } from "react";

import { type PaymentOptions, offeredMethods } from "@/core/billing";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

import { reportPaymentAction } from "./actions";

/**
 * Bank transfer, Wise or PayPal, as finance set them up (0072), with the
 * order reference to quote. Once paid, the client says so here; the team
 * confirms when the money arrives and the work starts as with a card.
 */
export function OtherWays({ orderId, orderRef, price, options }: { orderId: string; orderRef: string; price: string; options: PaymentOptions }) {
  const methods = offeredMethods(options);
  const [method, setMethod] = useState<string>(methods[0]?.[0] ?? "OTHER");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (methods.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Or pay by {methods.map(([, l]) => l).join(", ").replace(/, ([^,]*)$/, " or $1")}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[length:var(--fs-2)]">
        <p className="text-muted-foreground">
          Send {price} and quote <span className="font-mono font-medium text-foreground">{orderRef}</span> as the reference.
        </p>
        {methods.map(([m, label, key]) => (
          <div key={m} className="space-y-1">
            <p className="font-medium text-[length:var(--fs-3)]">{label}</p>
            {key === "paypal_link" ? (
              <a href={options.paypal_link!} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Pay with PayPal
              </a>
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-[var(--r-md)] bg-subtle p-3 font-mono text-[length:var(--fs-2)]">{options[key]}</p>
            )}
          </div>
        ))}

        {done ? (
          <p role="status" className="rounded-[var(--r-md)] border border-border p-3">
            Thank you. We will confirm as soon as the money arrives, usually within one working day, and start your order then.
          </p>
        ) : (
          <form
            className="space-y-3 border-t border-border pt-4"
            action={(fd) => {
              setError(null);
              fd.set("order_id", orderId);
              fd.set("method", method);
              start(async () => {
                const r = await reportPaymentAction(fd);
                if (!r.ok) return setError(r.error);
                setDone(true);
                toast("Thanks. The team has been told.");
              });
            }}
          >
            <p className="font-medium text-[length:var(--fs-3)]">Paid already? Tell us</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Paid by" htmlFor="op-method">
                <Select id="op-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map(([m, l]) => (
                    <option key={m} value={m}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Transfer reference" htmlFor="op-ref" optional>
                <Input id="op-ref" name="reference" maxLength={120} />
              </Field>
            </div>
            {error && <p role="alert" className="text-[color:var(--tone-danger-fg)]">{error}</p>}
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Sending…" : "I've paid"}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
