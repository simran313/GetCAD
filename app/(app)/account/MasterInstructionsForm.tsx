"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveMasterInstructionsAction } from "@/lib/client/standingActions";
import { actionErrorText } from "@/lib/refusal";

const MAX = 4000;

/**
 * Master instructions (owner, 5 Nov 2026; 0062): the client's factory rules,
 * written once and shown on every order to the designer and the pod lead.
 * Saved in place, so what was typed stays on screen.
 */
export function MasterInstructionsForm({ initial }: { initial: string }) {
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = body.trim() !== saved.trim();

  const save = () => {
    const fd = new FormData();
    fd.set("body", body);
    setError(null);
    start(async () => {
      try {
        await saveMasterInstructionsAction(fd);
        setSaved(body);
      } catch (e) {
        setError(actionErrorText(e) ?? "Not saved. Try again.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <label htmlFor="master-body" className="sr-only">
        Master instructions
      </label>
      <Textarea
        id="master-body"
        rows={5}
        maxLength={MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"e.g. Shank at least 1.8 mm. Prongs 0.9 mm. Add 0.1 mm for casting. Sprue on the inside of the shank."}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save
        </Button>
        {!dirty && saved.trim() && !pending && (
          <span role="status" className="flex items-center gap-1 text-[length:var(--fs-2)] text-muted-foreground">
            <Check className="h-4 w-4" aria-hidden /> Saved · on every order
          </span>
        )}
        <span className="tabular ml-auto text-[length:var(--fs-1)] text-muted-foreground">
          {body.length}/{MAX}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}
