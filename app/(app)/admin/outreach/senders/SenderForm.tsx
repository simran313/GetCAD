"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { KINDS, SENDER_CHANNELS } from "@/core/outreach";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { saveSenderAction } from "../actions";
import type { SenderRow, TeamMember } from "../types";

/** Add a sender (no `sender`) or change one. */
export function SenderForm({ sender, team, onDone }: { sender?: SenderRow; team: TeamMember[]; onDone?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = sender?.id ?? "new";

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await saveSenderAction(fd);
          if (!r.ok) return setError(r.error);
          toast(sender ? "Sender saved." : "Sender added.");
          onDone?.();
          router.refresh();
        });
      }}
    >
      {sender && <input type="hidden" name="id" value={sender.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`s-label-${key}`} hint="What the team calls it, e.g. “Cold 1” or “Simran main”.">
          <Input id={`s-label-${key}`} name="label" required maxLength={60} defaultValue={sender?.label ?? ""} />
        </Field>
        <Field label="Channel" htmlFor={`s-channel-${key}`}>
          <Select id={`s-channel-${key}`} name="channel" defaultValue={sender?.channel ?? "EMAIL"}>
            {SENDER_CHANNELS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Address" htmlFor={`s-address-${key}`} hint="The email address, number or handle it writes from.">
          <Input id={`s-address-${key}`} name="address" required maxLength={200} defaultValue={sender?.address ?? ""} />
        </Field>
        <Field label="Writes to" htmlFor={`s-kind-${key}`} hint="Use the main domain for people you know, a second domain for prospects.">
          <Select id={`s-kind-${key}`} name="for_kind" defaultValue={sender?.for_kind ?? "ANY"}>
            <option value="ANY">Both lists</option>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>{l} only</option>
            ))}
          </Select>
        </Field>
        <Field label="Daily limit" htmlFor={`s-limit-${key}`} hint="A new address: 20 a day for the first weeks, then raise it slowly.">
          <Input id={`s-limit-${key}`} name="daily_limit" type="number" min={1} max={500} defaultValue={sender?.daily_limit ?? 20} />
        </Field>
        <Field label="Handled by" htmlFor={`s-owner-${key}`} hint="Contacts imported through it belong to this person.">
          <Select id={`s-owner-${key}`} name="owner_id" defaultValue={sender?.owner_id ?? ""}>
            <option value="">Whoever imports</option>
            {team.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.name}{m.is_admin ? " (admin)" : ""}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Signature" htmlFor={`s-sig-${key}`} optional hint="Added to the end of a message opened in Gmail from a contact's page.">
        <Textarea id={`s-sig-${key}`} name="signature" rows={4} maxLength={1000} defaultValue={sender?.signature ?? ""} />
      </Field>
      {sender && (
        <Field label="Status" htmlFor={`s-active-${key}`} hint="A paused sender gets no new contacts; its history stays.">
          <Select id={`s-active-${key}`} name="active" defaultValue={sender.active ? "true" : "false"} className="sm:w-56">
            <option value="true">In use</option>
            <option value="false">Paused</option>
          </Select>
        </Field>
      )}
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : sender ? "Save sender" : "Add sender"}</Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function SenderEdit({ sender, team }: { sender: SenderRow; team: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-4">
      <SenderForm sender={sender} team={team} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
      Edit
    </Button>
  );
}
