"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KINDS, PLACEHOLDERS, SEGMENTS, SENDER_CHANNELS, type OutreachTemplate, fillTemplate } from "@/core/outreach";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { saveTemplateAction } from "../actions";

const EXAMPLE = { contact_name: "Ana Lopez", business_name: "Bright Bridal", city: "Austin", my_name: "Simran" };

/** Add a template (no `template`) or change one, with a live example. */
export function TemplateForm({ template, onDone }: { template?: OutreachTemplate; onDone?: () => void }) {
  const router = useRouter();
  const key = template?.id ?? "new";
  const [channel, setChannel] = useState(template?.channel ?? "EMAIL");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await saveTemplateAction(fd);
          if (!r.ok) return setError(r.error);
          toast(template ? "Template saved." : "Template added.");
          onDone?.();
          router.refresh();
        });
      }}
    >
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`t-name-${key}`}>
          <Input id={`t-name-${key}`} name="name" required maxLength={80} defaultValue={template?.name ?? ""} />
        </Field>
        <Field label="Channel" htmlFor={`t-ch-${key}`}>
          <Select id={`t-ch-${key}`} name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {SENDER_CHANNELS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Message in the sequence" htmlFor={`t-step-${key}`}>
          <Select id={`t-step-${key}`} name="step" defaultValue={String(template?.step ?? 1)}>
            <option value="1">Message 1 (day 1)</option>
            <option value="2">Message 2 (day 4)</option>
            <option value="3">Message 3 (day 10)</option>
          </Select>
        </Field>
        <Field label="For" htmlFor={`t-list-${key}`}>
          <Select id={`t-list-${key}`} name="list" defaultValue={template?.list ?? "ANY"}>
            <option value="ANY">Both lists</option>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Business type" htmlFor={`t-seg-${key}`} hint="Used before a template for any type.">
          <Select id={`t-seg-${key}`} name="segment" defaultValue={template?.segment ?? ""}>
            <option value="">Any type</option>
            {SEGMENTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        {template && (
          <Field label="Status" htmlFor={`t-active-${key}`}>
            <Select id={`t-active-${key}`} name="active" defaultValue={template.active ? "true" : "false"}>
              <option value="true">In use</option>
              <option value="false">Off</option>
            </Select>
          </Field>
        )}
      </div>
      {channel === "EMAIL" && (
        <Field label="Subject" htmlFor={`t-sub-${key}`}>
          <Input id={`t-sub-${key}`} name="subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
      )}
      <Field
        label="Message"
        htmlFor={`t-body-${key}`}
        hint={`You can use ${PLACEHOLDERS.map(([k]) => k).join(", ")}. Put [square brackets] around anything the sender must replace with a real detail.${channel === "EMAIL" ? " The sender's signature is added at the end." : ""}`}
      >
        <Textarea id={`t-body-${key}`} name="body" required rows={8} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {body.trim() && (
        <div className="rounded-[var(--r-md)] border border-border bg-subtle p-4 text-[length:var(--fs-2)]">
          <p className="mb-2 font-medium">Example, for Ana Lopez at Bright Bridal</p>
          {channel === "EMAIL" && subject && <p className="mb-2">Subject: {fillTemplate(subject, EXAMPLE)}</p>}
          <p className="whitespace-pre-wrap">{fillTemplate(body, EXAMPLE)}</p>
        </div>
      )}
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : template ? "Save template" : "Add template"}</Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function TemplateEdit({ template }: { template: OutreachTemplate }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-4 border-t border-border pt-4">
      <TemplateForm template={template} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
      Edit
    </Button>
  );
}
