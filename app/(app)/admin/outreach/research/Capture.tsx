"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { FITS } from "@/core/outreach/research";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { type CheckResult, addContactAction, checkContactAction } from "../actions";

const BY: Record<string, string> = { email: "email", phone: "phone number", instagram: "Instagram", website: "website" };

/**
 * Capture one prospect while researching an area: the place and business
 * type are filled in; as soon as the email, phone, Instagram or website is
 * entered, the portal says whether the business is already in outreach or a
 * client, so no time goes on it. "Save and next" keeps the area.
 */
export function Capture({ area }: { area: { id: string; segment: string; city: string; region: string | null; country: string } }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState("");
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [pending, start] = useTransition();

  async function runCheck() {
    if (!form.current) return;
    const fd = new FormData(form.current);
    const fields: Record<string, string> = {};
    for (const k of ["email", "phone", "instagram", "website"]) {
      const v = fd.get(k)?.toString().trim();
      if (v) fields[k] = v;
    }
    if (Object.keys(fields).length === 0) return setCheck(null);
    const r = await checkContactAction(fields);
    setCheck(r.ok && r.data ? r.data : null);
  }

  return (
    <form
      ref={form}
      className="space-y-4"
      // onSubmit, not action: React resets an action form when its transition
      // ends, which here is after router.refresh(), so whatever was typed for
      // the next prospect in between was wiped (and its repeat check missed).
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        fd.set("kind", "PROSPECT");
        fd.set("area_id", area.id);
        fd.set("segment", area.segment);
        fd.set("city", fd.get("city")?.toString() || area.city);
        fd.set("region", area.region ?? "");
        fd.set("country", area.country);
        fd.set("fit", fit);
        fd.set("source", "Research");
        const name = fd.get("business_name")?.toString() || fd.get("email")?.toString() || "Prospect";
        start(async () => {
          const r = await addContactAction(fd);
          if (!r.ok || !r.data) return setError(r.ok ? "No answer from the server." : r.error);
          toast(`${name} added.`);
          setAdded((a) => [{ id: r.data!, name }, ...a].slice(0, 5));
          form.current?.reset();
          setFit("");
          setCheck(null);
          router.refresh();
          (form.current?.elements.namedItem("business_name") as HTMLInputElement | null)?.focus();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="cap-business">
          <Input id="cap-business" name="business_name" maxLength={200} autoComplete="off" />
        </Field>
        <Field label="Website" htmlFor="cap-website" hint="Checked for repeats as you leave the field.">
          <Input id="cap-website" name="website" maxLength={300} autoComplete="off" onBlur={runCheck} />
        </Field>
        <Field label="Email" htmlFor="cap-email" hint="From their website's contact page, Instagram bio or Google profile.">
          <Input id="cap-email" name="email" type="email" maxLength={254} autoComplete="off" onBlur={runCheck} />
        </Field>
        <Field label="Phone or WhatsApp" htmlFor="cap-phone">
          <Input id="cap-phone" name="phone" type="tel" maxLength={40} autoComplete="off" onBlur={runCheck} />
        </Field>
        <Field label="Instagram" htmlFor="cap-instagram">
          <Input id="cap-instagram" name="instagram" maxLength={120} autoComplete="off" onBlur={runCheck} />
        </Field>
        <Field label="Contact name" htmlFor="cap-contact" optional>
          <Input id="cap-contact" name="contact_name" maxLength={120} autoComplete="off" />
        </Field>
      </div>

      {check?.state && (
        <p
          role="status"
          className="rounded-[var(--r-md)] border border-[color:var(--tone-danger-line)] bg-[color:var(--tone-danger-bg)] px-4 py-3 text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]"
        >
          {check.state === "CLIENT"
            ? "This email belongs to a client already. Skip it."
            : `Already in outreach (same ${BY[check.by ?? ""] ?? "details"}). Skip it and move on.`}
        </p>
      )}

      <Field label="A real detail" htmlFor="cap-detail" hint="Finishes “I saw …” in message 1, e.g. the halo ring you posted last week. Specific beats flattering.">
        <Input id="cap-detail" name="detail" maxLength={300} autoComplete="off" />
      </Field>

      <fieldset>
        <legend className="mb-2 text-[length:var(--fs-2)] font-medium">Fit</legend>
        <div className="flex flex-wrap gap-2">
          {FITS.map(([v, l, why]) => (
            <button
              key={v}
              type="button"
              title={why}
              aria-pressed={fit === v}
              onClick={() => setFit(fit === v ? "" : v)}
              className={cn(
                "rounded-[var(--r-xs)] border px-3.5 py-1.5 text-[length:var(--fs-2)] transition-colors",
                fit === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {v}: {l}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[length:var(--fs-2)] text-muted-foreground">
          {fit ? FITS.find(([v]) => v === fit)![2] : "Strong fits are offered first on Today."}
        </p>
      </fieldset>

      <Field label="Notes" htmlFor="cap-notes" optional>
        <Textarea id="cap-notes" name="notes" rows={2} maxLength={4000} />
      </Field>

      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || check?.state != null}>{pending ? "Saving…" : "Save and next"}</Button>
        <span className="text-[length:var(--fs-2)] text-muted-foreground">
          Goes to {area.city} with the business type of this area, and to a prospect sender.
        </span>
      </div>

      {added.length > 0 && (
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          Just added:{" "}
          {added.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link href={`/admin/outreach/${a.id}`} className="underline underline-offset-2">{a.name}</Link>
            </span>
          ))}
        </p>
      )}
    </form>
  );
}
