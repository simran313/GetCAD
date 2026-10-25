"use client";

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

/**
 * One save per section (redesign): appears only when something changed,
 * says what will change (before → after, for values that move money), and
 * offers Discard and Save. Sits above the phone's bottom bar.
 */
export function StickySaveBar({
  dirty,
  changes = [],
  saving = false,
  onDiscard,
  formId,
  onSave,
  label = "Save changes",
}: {
  dirty: boolean;
  changes?: { label: string; before: string; after: string }[];
  saving?: boolean;
  onDiscard: () => void;
  formId?: string;
  onSave?: () => void;
  label?: string;
}) {
  return (
    <div
      aria-hidden={!dirty}
      className={cn(
        "fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 px-3 transition-[transform,opacity] duration-[var(--dur-base)] ease-out md:bottom-6 md:left-[var(--sidebar-w,0px)] md:px-6",
        dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-[var(--r-lg)] border border-border bg-background p-[var(--s-3)] shadow-[var(--e-2)] sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 px-1">
          <p className="text-[length:var(--fs-2)] font-medium">
            {changes.length > 0 ? `${changes.length} ${changes.length === 1 ? "change" : "changes"} not saved` : "Unsaved changes"}
          </p>
          {changes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {changes.slice(0, 3).map((c) => (
                <li key={c.label} className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-2)] text-muted-foreground">
                  <span className="text-foreground">{c.label}</span>
                  <span className="tabular line-through">{c.before}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-label="to" />
                  <span className="tabular font-medium text-foreground">{c.after}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving} className="flex-1 sm:flex-none">
            Discard
          </Button>
          <Button type={formId ? "submit" : "button"} form={formId} onClick={onSave} disabled={saving} className="flex-1 sm:flex-none">
            {saving ? "Saving…" : label}
          </Button>
        </div>
      </div>
    </div>
  );
}
