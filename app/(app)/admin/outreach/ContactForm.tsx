"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KINDS, SEGMENTS } from "@/core/outreach";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pills } from "@/components/ui/pills";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { addContactAction, updateContactAction } from "./actions";
import type { ContactDetail } from "./types";

type Values = Partial<Pick<ContactDetail,
  "id" | "kind" | "business_name" | "contact_name" | "email" | "phone" | "whatsapp" | "instagram" | "linkedin" |
  "website" | "city" | "region" | "country" | "segment" | "tags" | "notes" | "source">>;

const TEXT: [keyof Values, string, string?][] = [
  ["business_name", "Business name"],
  ["contact_name", "Contact name"],
  ["email", "Email", "email"],
  ["phone", "Phone", "tel"],
  ["whatsapp", "WhatsApp (with country code)", "tel"],
  ["instagram", "Instagram handle or link"],
  ["linkedin", "LinkedIn link"],
  ["website", "Website"],
  ["city", "City"],
  ["region", "State or region"],
  ["country", "Country"],
];

/**
 * One contact's details: adding (no id; then opens the new contact) or
 * editing. Every field is optional except a name or email and one way to
 * reach them, which the database checks.
 */
export function ContactForm({
  initial = {},
  senders = [],
  onDone,
}: {
  initial?: Values;
  senders?: { id: string; label: string }[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = Boolean(initial.id);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      if (editing) {
        const r = await updateContactAction(fd);
        if (!r.ok) return setError(r.error);
        toast("Saved.");
        onDone?.();
        router.refresh();
      } else {
        const r = await addContactAction(fd);
        if (!r.ok || !r.data) return setError(r.ok ? "No answer from the server." : r.error);
        toast("Contact added.");
        router.push(`/admin/outreach/${r.data}`);
      }
    });
  }

  return (
    <form action={submit} className="space-y-5">
      {editing && <input type="hidden" name="id" value={initial.id} />}
      <Pills
        name="kind"
        legend="Which list"
        required
        defaultValue={initial.kind ?? "EXISTING"}
        options={KINDS.map(([v, l]) => ({ value: v, label: l }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT.map(([key, label, type]) => (
          <Field key={key} label={label} htmlFor={`c-${key}`}>
            <Input id={`c-${key}`} name={key} type={type ?? "text"} defaultValue={(initial[key] as string | null) ?? ""} />
          </Field>
        ))}
        <Field label="Business type" htmlFor="c-segment">
          <Select id="c-segment" name="segment" defaultValue={initial.segment ?? ""}>
            <option value="">Not sure</option>
            {SEGMENTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="c-tags" hint="Separated by commas, e.g. bridal, texas">
          <Input id="c-tags" name="tags" defaultValue={(initial.tags ?? []).join(", ")} />
        </Field>
        <Field label="Where you found them" htmlFor="c-source">
          <Input id="c-source" name="source" defaultValue={initial.source ?? ""} />
        </Field>
        {!editing && senders.length > 0 && (
          <Field label="Send from" htmlFor="c-sender">
            <Select id="c-sender" name="sender_id" defaultValue="">
              <option value="">No sender yet</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Notes" htmlFor="c-notes">
        <Textarea id="c-notes" name="notes" rows={3} maxLength={4000} defaultValue={initial.notes ?? ""} />
      </Field>
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save details" : "Add contact"}</Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
