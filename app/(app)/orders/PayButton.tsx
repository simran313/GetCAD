"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { declineText } from "@/core/billing";
import { formatMoney } from "@/lib/money";

import { startPaymentAction } from "./paymentActions";
import { actionErrorText } from "@/lib/refusal";

/**
 * Opens Razorpay Checkout for a QUOTED order.
 *
 * The browser's job ends at "checkout closed". It never tells the server a
 * payment succeeded — the signed webhook does that, so a client cannot fund
 * their own order by tampering with this component. After a payment we refresh
 * every few seconds and let the order's real status speak: once the webhook
 * has landed the order is no longer QUOTED and this button is gone.
 */
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", cb: (r: { error?: { description?: string; reason?: string } }) => void) => void;
    };
  }
}

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("checkout failed to load"));
    document.body.appendChild(script);
  });
}

export function PayButton({
  orderId,
  amount,
  currency,
}: {
  orderId: string;
  amount: number;
  currency: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [slow, setSlow] = useState(false);
  const router = useRouter();

  // The webhook usually lands within seconds; check for it rather than asking
  // the client to refresh. Stops after about a minute.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= 20) {
        clearInterval(timer);
        setSlow(true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [awaitingConfirmation, router]);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("order_id", orderId);
      const result = await startPaymentAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      await loadCheckout();
      if (!window.Razorpay) {
        setError("Checkout could not be loaded. Please try again.");
        return;
      }

      const checkout = new window.Razorpay({
        key: result.keyId,
        order_id: result.razorpayOrderId,
        amount: result.amount,
        currency: result.currency,
        name: "The CAD Pillar",
        description: `Order ${orderId}`,
        prefill: result.prefill,
        // Payment confirmation arrives by webhook, so all we do here is stop
        // showing the button and tell the user what to expect.
        handler: () => setAwaitingConfirmation(true),
        modal: { ondismiss: () => setBusy(false) },
      });
      // Checkout shows the decline itself and lets them retry; this keeps a
      // plain sentence on the page in case they close it.
      checkout.on("payment.failed", (r) => {
        setError(declineText(r.error?.description));
      });
      checkout.open();
    } catch (e) {
      setError(actionErrorText(e) ?? "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="rounded-md border border-border bg-subtle px-3 py-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
        <p className="font-medium">Payment submitted</p>
        <p className="mt-1 text-muted-foreground">
          {slow ? (
            <>
              It is taking longer than usual. Your payment is safe: refresh in a minute, or message the team if it
              still shows as unpaid.
            </>
          ) : (
            <>
              We&apos;re confirming it with the payment provider. This page updates by itself to{" "}
              <span className="font-medium">Payment held</span>, usually within a few seconds.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Button onClick={pay} disabled={busy}>
        {busy ? "Opening checkout…" : `Pay ${formatMoney(amount, currency)}`}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
