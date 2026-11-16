"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  type OutreachTemplate,
  SEQUENCE,
  channelLabel,
  fillTemplate,
  gmailComposeUrl,
  instagramUrl,
  pickTemplate,
  reachableChannels,
  unfilledParts,
  websiteUrl,
  whatsappUrl,
} from "@/core/outreach";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { logTouchAction } from "./actions";

export interface ComposeContact {
  id: string;
  kind: string;
  segment: string | null;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  linkedin: string | null;
  city: string | null;
  detail?: string | null;
  touches: number;
  do_not_contact?: boolean;
}

export interface ComposeSender {
  id: string;
  label: string;
  channel: string;
  address: string;
  signature: string | null;
}

/**
 * Write the next message to one contact: the right template for the
 * sequence step, filled in and editable; one button opens it ready to send
 * (Gmail from the sender's account, WhatsApp, or copied for Instagram and
 * LinkedIn); then "Mark as sent" records it, and the next date follows.
 * Nothing is sent from the portal.
 */
export function Compose({
  contact,
  sender,
  templates,
  myName,
  onSent,
}: {
  contact: ComposeContact;
  sender: ComposeSender | null;
  templates: OutreachTemplate[];
  myName: string | null;
  onSent?: () => void;
}) {
  const router = useRouter();
  const channels = reachableChannels(contact);
  const step = Math.min(contact.touches + 1, 3);
  const firstChannel = sender && channels.includes(sender.channel) ? sender.channel : (channels[0] ?? "EMAIL");
  const [channel, setChannel] = useState(firstChannel);
  const best = useMemo(
    () => pickTemplate(templates, { channel, step, list: contact.kind, segment: contact.segment }),
    [templates, channel, step, contact.kind, contact.segment],
  );
  const [templateId, setTemplateId] = useState<string>(best?.id ?? "");
  const template = templates.find((t) => t.id === templateId) ?? null;
  const fill = (s: string) => fillTemplate(s, { ...contact, my_name: myName });
  const signature = channel === "EMAIL" && sender?.channel === "EMAIL" && sender.signature ? `\n\n${sender.signature}` : "";
  const [subject, setSubject] = useState(template?.subject ? fill(template.subject) : "");
  const [body, setBody] = useState(template ? fill(template.body) + signature : "");
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function applyTemplate(t: OutreachTemplate | null, ch = channel) {
    setTemplateId(t?.id ?? "");
    setSubject(t?.subject ? fill(t.subject) : "");
    const sig = ch === "EMAIL" && sender?.channel === "EMAIL" && sender.signature ? `\n\n${sender.signature}` : "";
    setBody(t ? fill(t.body) + sig : "");
  }

  if (contact.do_not_contact) {
    return <p className="text-[length:var(--fs-2)] text-muted-foreground">Marked do not contact: no messages.</p>;
  }
  if (channels.length === 0) {
    return <p className="text-[length:var(--fs-2)] text-muted-foreground">No email, phone, Instagram or LinkedIn on file. Add one under Details.</p>;
  }

  const missing = unfilledParts(`${subject}\n${body}`);
  const fromSender = channel === "EMAIL" && sender?.channel === "EMAIL" ? sender.address : null;
  const wa = whatsappUrl(contact.whatsapp ?? contact.phone ?? "", body);
  const open =
    channel === "EMAIL" && contact.email
      ? { href: gmailComposeUrl(contact.email, { from: fromSender, subject, body }), label: fromSender ? `Open in Gmail (${fromSender})` : "Open in Gmail" }
      : channel === "WHATSAPP" && wa
        ? { href: wa, label: "Open WhatsApp" }
        : channel === "INSTAGRAM" && contact.instagram
          ? { href: instagramUrl(contact.instagram), label: "Copy and open Instagram" }
          : channel === "LINKEDIN" && contact.linkedin && websiteUrl(contact.linkedin)
            ? { href: websiteUrl(contact.linkedin)!, label: "Copy and open LinkedIn" }
            : null;
  const copyFirst = channel === "INSTAGRAM" || channel === "LINKEDIN";

  function markSent() {
    setError(null);
    const fd = new FormData();
    fd.set("id", contact.id);
    fd.set("kind", "SENT");
    fd.set("channel", channel);
    fd.set("body", subject ? `${subject}\n\n${body}` : body);
    fd.set("step", String(step));
    if (templateId) fd.set("template_id", templateId);
    if (sender && sender.channel === channel) fd.set("sender_id", sender.id);
    start(async () => {
      const r = await logTouchAction(fd);
      if (!r.ok) return setError(r.error);
      toast(step < 3 ? `Message ${step} recorded. Next one is due on day ${SEQUENCE[step]!.day}.` : "Message 3 recorded. The sequence is done.");
      setOpened(false);
      onSent?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        {SEQUENCE[step - 1]!.label} of 3{contact.touches >= 3 ? " (the sequence is done; this is an extra message)" : ""}
        {sender ? ` · from ${sender.label}` : " · no sender assigned"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Send by" htmlFor={`ch-${contact.id}`}>
          <Select
            id={`ch-${contact.id}`}
            value={channel}
            onChange={(e) => {
              const ch = e.target.value;
              setChannel(ch);
              applyTemplate(pickTemplate(templates, { channel: ch, step, list: contact.kind, segment: contact.segment }), ch);
            }}
          >
            {channels.map((c) => (
              <option key={c} value={c}>{channelLabel(c)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Template" htmlFor={`tpl-${contact.id}`}>
          <Select
            id={`tpl-${contact.id}`}
            value={templateId}
            onChange={(e) => applyTemplate(templates.find((t) => t.id === e.target.value) ?? null)}
          >
            <option value="">Blank message</option>
            {templates
              .filter((t) => t.active && t.channel === channel)
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </Select>
        </Field>
      </div>
      {channel === "EMAIL" && (
        <Field label="Subject" htmlFor={`sub-${contact.id}`}>
          <Input id={`sub-${contact.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
      )}
      <Field
        label="Message"
        htmlFor={`body-${contact.id}`}
        hint={missing.length > 0 ? undefined : "Read it once more, then open it and press Send there."}
        error={missing.length > 0 ? `Replace before sending: ${missing.join(", ")}` : null}
      >
        <Textarea id={`body-${contact.id}`} rows={channel === "EMAIL" ? 10 : 5} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {open && (
          <a
            href={open.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: opened ? "outline" : "default" })}
            onClick={() => {
              if (copyFirst) void navigator.clipboard?.writeText(body).then(() => toast("Message copied. Paste it there."));
              setOpened(true);
            }}
          >
            {open.label}
          </a>
        )}
        {!open && (
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(body).then(() => toast("Message copied."))}>
            Copy message
          </Button>
        )}
        <Button type="button" variant={opened ? "default" : "outline"} disabled={pending || !body.trim()} onClick={markSent}>
          {pending ? "Saving…" : "Mark as sent"}
        </Button>
      </div>
    </div>
  );
}
