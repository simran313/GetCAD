"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { resolveEscalationAction } from "../actions";

/** An admin closes an escalation with a note for the pod lead (Phase 13c). */
export function ResolveEscalation({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await resolveEscalationAction(id, note);
            toast("Resolved");
            router.refresh();
          } catch (err) {
            toast(actionErrorText(err) ?? "Not saved. Try again.", "danger");
          }
        });
      }}
    >
      <Input aria-label="Resolution note" placeholder="What was done" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="min-w-0 flex-1" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Resolve
      </Button>
    </form>
  );
}
