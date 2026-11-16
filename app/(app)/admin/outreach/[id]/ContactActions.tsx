"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { STAGES, TOUCH_CHANNELS } from "@/core/outreach";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { type OutreachResult, assignAction, logTouchAction, setDncAction, setStageAction } from "../actions";
import { ContactForm } from "../ContactForm";
import type { ContactDetail, SenderRow, TeamMember } from "../types";

/** A date picked on the page, as 9 AM that day on this device, for the database. */
const morningOf = (day: string): string | null => (day ? new Date(`${day}T09:00`).toISOString() : null);

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<OutreachResult<unknown>>, done: string, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      toast(done);
      after?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

const Err = ({ error }: { error: string | null }) =>
  error ? <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p> : null;

/** Record a send, a reply or a note, with the date to follow up. */
export function LogTouch({ contact, senders }: { contact: ContactDetail; senders: SenderRow[] }) {
  const { pending, error, run } = useRun();
  const [kind, setKind] = useState<"SENT" | "REPLIED" | "NOTE">(contact.do_not_contact || contact.touches === 0 ? "NOTE" : "REPLIED");
  const defaultChannel = contact.email ? "EMAIL" : contact.whatsapp ? "WHATSAPP" : contact.instagram ? "INSTAGRAM" : "PHONE";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record by hand</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          action={(fd) => {
            fd.set("id", contact.id);
            fd.set("kind", kind);
            fd.set("follow_up", morningOf(String(fd.get("follow_day") ?? "")) ?? "");
            run(() => logTouchAction(fd), kind === "SENT" ? "Recorded as sent." : kind === "REPLIED" ? "Reply recorded." : "Note saved.", () => {
              const f = document.getElementById("touch-body") as HTMLTextAreaElement | null;
              if (f) f.value = "";
            });
          }}
        >
          <div role="radiogroup" aria-label="What happened" className="flex flex-wrap gap-2">
            {([["SENT", "I wrote to them"], ["REPLIED", "They replied"], ["NOTE", "Note"]] as const).map(([k, l]) => (
              <Button
                key={k}
                type="button"
                size="sm"
                role="radio"
                aria-checked={kind === k}
                variant={kind === k ? "default" : "outline"}
                disabled={k === "SENT" && contact.do_not_contact}
                onClick={() => setKind(k)}
              >
                {l}
              </Button>
            ))}
          </div>
          {kind !== "NOTE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How" htmlFor="touch-channel">
                <Select id="touch-channel" name="channel" defaultValue={defaultChannel}>
                  {TOUCH_CHANNELS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="From" htmlFor="touch-sender">
                <Select id="touch-sender" name="sender_id" defaultValue={contact.sender_id ?? ""}>
                  <option value="">{contact.sender ? `${contact.sender.label} (assigned)` : "Not recorded"}</option>
                  {senders.filter((s) => s.id !== contact.sender_id).map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.address})</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <Field label={kind === "NOTE" ? "Note" : "What was said"} htmlFor="touch-body" optional={kind !== "NOTE"}>
            <Textarea id="touch-body" name="body" rows={3} maxLength={4000} required={kind === "NOTE"} />
          </Field>
          <Field
            label="Follow up on"
            htmlFor="touch-day"
            optional
            hint={kind === "SENT" ? "For a message sent outside this page. Leave empty to follow the sequence (day 4, then day 10)." : undefined}
          >
            <Input id="touch-day" name="follow_day" type="date" className="sm:w-56" />
          </Field>
          <Err error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Stage, do-not-contact, and (admins) who and which address. */
export function ContactSide({
  contact,
  senders,
  team,
  isAdmin,
}: {
  contact: ContactDetail;
  senders: SenderRow[];
  team: TeamMember[];
  isAdmin: boolean;
}) {
  const stage = useRun();
  const dnc = useRun();
  const assign = useRun();
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Stage" htmlFor="stage">
            <Select
              id="stage"
              defaultValue={contact.stage}
              disabled={stage.pending}
              onChange={(e) => {
                const fd = new FormData();
                fd.set("id", contact.id);
                fd.set("stage", e.target.value);
                stage.run(() => setStageAction(fd), "Stage changed.");
              }}
            >
              {STAGES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Err error={stage.error} />

          <form
            className="space-y-2"
            action={(fd) => {
              fd.set("id", contact.id);
              fd.set("dnc", String(!contact.do_not_contact));
              dnc.run(() => setDncAction(fd), contact.do_not_contact ? "They can be contacted again." : "Marked do not contact.");
            }}
          >
            <Field
              label={contact.do_not_contact ? "Contact them again" : "Do not contact"}
              htmlFor="dnc-reason"
              hint={contact.do_not_contact ? `Now: ${contact.dnc_reason ?? "no reason given"}` : "They are kept on file so they are never imported or written to again."}
            >
              <Input id="dnc-reason" name="reason" required placeholder={contact.do_not_contact ? "Why it is fine now" : "e.g. asked to be removed"} />
            </Field>
            <Err error={dnc.error} />
            <Button type="submit" size="sm" variant={contact.do_not_contact ? "outline" : "destructive"} disabled={dnc.pending}>
              {contact.do_not_contact ? "Allow contact" : "Mark do not contact"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Who and from where</CardTitle>
          </CardHeader>
          <CardBody>
            <form
              className="space-y-4"
              action={(fd) => {
                fd.set("ids", contact.id);
                assign.run(() => assignAction(fd), "Handed over.");
              }}
            >
              <Field label="Sender" htmlFor="as-sender">
                <Select id="as-sender" name="sender_id" defaultValue={contact.sender_id ?? "NONE"}>
                  <option value="NONE">No sender</option>
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({s.address}){s.active ? "" : " · paused"}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Owner" htmlFor="as-owner" hint="Only people with the Sales role. A rep sees only the contacts they own.">
                <Select id="as-owner" name="owner_id" defaultValue={contact.owner_id ?? ""}>
                  {!contact.owner_id && <option value="">Nobody</option>}
                  {team.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.name}{m.is_admin ? " (admin)" : ""}</option>
                  ))}
                </Select>
              </Field>
              <Err error={assign.error} />
              <Button type="submit" size="sm" variant="outline" disabled={assign.pending}>Save</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          {editing ? (
            <ContactForm initial={contact} onDone={() => setEditing(false)} />
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
