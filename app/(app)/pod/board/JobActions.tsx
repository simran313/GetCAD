"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { escalateJobAction, reassignJobAction, withdrawJobAction } from "../actions";

/**
 * Move a job to another designer, take it back from its designer (0066:
 * it waits for a designer again; the designer and the admins are told), or
 * escalate it to an admin (Phase 13c). Folded away under one line on the
 * board; open on the order page, where it sits under "Other actions".
 */
export function JobActions({
  orderId,
  label,
  status,
  designers,
  inline = false,
}: {
  orderId: string;
  label: string;
  status: string;
  designers: { id: string; name: string; load: string; assignable: boolean }[];
  /** Without the fold (the order page already folds it). */
  inline?: boolean;
}) {
  const router = useRouter();
  const ids = { to: useId(), why: useId(), esc: useId(), back: useId() };
  const [back, setBack] = useState("");
  const canTakeBack = status === "ASSIGNED" || status === "IN_PROGRESS";
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const [esc, setEsc] = useState("");
  const [pending, start] = useTransition();
  const started = status !== "ASSIGNED";

  const run = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      try {
        await fn();
        toast(done);
        setTo("");
        setWhy("");
        setEsc("");
        setBack("");
        router.refresh();
      } catch (e) {
        toast(actionErrorText(e) ?? "Not saved. Try again.", "danger");
      }
    });

  const body = (
    <div className={inline ? "space-y-3" : "mt-2 space-y-3"}>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => reassignJobAction(orderId, to, why), "Job moved");
          }}
        >
          <label htmlFor={ids.to} className="sr-only">
            Move {label} to
          </label>
          <Select id={ids.to} value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="" disabled>
              Move to…
            </option>
            {designers.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.assignable}>
                {d.name} · {d.load}
                {d.assignable ? "" : " · not signed"}
              </option>
            ))}
          </Select>
          <Input
            id={ids.why}
            aria-label="Why it moves"
            placeholder={started ? "Why it moves (required)" : "Why it moves (optional)"}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            required={started}
            maxLength={500}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !to}>
            Move job
          </Button>
        </form>
        {canTakeBack && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => withdrawJobAction(orderId, back), "Taken back · waiting for a designer");
            }}
          >
            <Input
              id={ids.back}
              aria-label="Why it is taken back"
              placeholder={started ? "Why it is taken back (required)" : "Why it is taken back (optional)"}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              required={started}
              maxLength={500}
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending || (started && !back.trim())}>
              Take back from the designer
            </Button>
          </form>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => escalateJobAction(orderId, esc), "Escalated to admin");
          }}
        >
          <Input id={ids.esc} aria-label="What needs an admin" placeholder="What needs an admin" value={esc} onChange={(e) => setEsc(e.target.value)} required maxLength={1000} />
          <Button type="submit" size="sm" variant="ghost" disabled={pending || !esc.trim()}>
            Escalate
          </Button>
        </form>
      </div>
  );
  if (inline) return <div className="text-[length:var(--fs-2)]">{body}</div>;
  return (
    <details className="group text-[length:var(--fs-2)]">
      <summary className="cursor-pointer list-none text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Move, take back or escalate</summary>
      {body}
    </details>
  );
}
