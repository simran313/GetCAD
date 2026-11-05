"use client";

import { FileBadge, Loader2, X } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { addCertificateAction, removeCertificateAction, type CertificateView } from "@/lib/client/standingActions";
import { actionErrorText } from "@/lib/refusal";
import { cn } from "@/lib/utils";

/**
 * Optional diamond certificate (owner, 5 Nov 2026; 0062): a picture of the
 * grading report, so the designer cuts the seat to the real stone. Inside the
 * brief's own form, so it cannot be a form itself: choosing a picture sends
 * it straight away (the input has no name, so the brief never carries it).
 */
export function Certificates({ orderId, initial, readOnly }: { orderId: string; initial: CertificateView[]; readOnly: boolean }) {
  const inputId = useId();
  const [certs, setCerts] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) => {
    const fd = new FormData();
    fd.set("order_id", orderId);
    fd.set("certificate", file);
    setError(null);
    start(async () => {
      try {
        setCerts(await addCertificateAction(fd));
      } catch (e) {
        setError(actionErrorText(e) ?? "The picture could not be added. Try again.");
      }
    });
  };

  const remove = (id: string) => {
    setError(null);
    start(async () => {
      try {
        setCerts(await removeCertificateAction(orderId, id));
      } catch (e) {
        setError(actionErrorText(e) ?? "It could not be removed. Try again.");
      }
    });
  };

  return (
    <div className="mt-2 rounded-[var(--r-md)] border border-dashed border-border p-[var(--s-3)]">
      <div className="flex flex-wrap items-center gap-2">
        <FileBadge className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-[length:var(--fs-2)] font-medium">Diamond certificate</span>
        <span className="text-[length:var(--fs-2)] text-muted-foreground">optional · for an exact seat</span>
        {!readOnly && certs.length < 5 && (
          <label htmlFor={inputId} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "ml-auto cursor-pointer")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {certs.length ? "Add another" : "Upload"}
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png"
              aria-label="Diamond certificate picture"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-1 text-[length:var(--fs-1)] text-muted-foreground">JPG or PNG. For a PDF, take a screenshot. Cover any company name.</p>
      {certs.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Certificates added">
          {certs.map((c, i) => (
            <li key={c.id} className="relative">
              <a href={c.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--r-sm)] border border-border bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={c.url} alt={`Certificate ${i + 1}`} className="h-16 w-16 object-cover" />
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={pending}
                  aria-label={`Remove certificate ${i + 1}`}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-[var(--e-1)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}
