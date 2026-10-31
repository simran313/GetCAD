"use client";

import { useState, useTransition } from "react";

import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";
import { cn } from "@/lib/utils";

import { saveEmailPreferencesAction } from "./actions";

/**
 * Email preferences (Phase 17). Order emails (quote, payment, first look,
 * files, refunds) are part of the service and always sent; these are the
 * optional ones. Saved on each switch.
 */
export interface EmailPrefs {
  messages: boolean;
  reminders: boolean;
  marketing: boolean;
}

const ROWS: { key: keyof EmailPrefs; label: string; hint: string }[] = [
  { key: "messages", label: "Messages from your team", hint: "An email when the team writes to you, at most one every half hour per order." },
  { key: "reminders", label: "Reminders and follow-ups", hint: "A nudge when a quote or a design is waiting, and a check-in after delivery." },
  { key: "marketing", label: "News and offers", hint: "Occasional updates from The CAD Pillar. Off unless you turn it on." },
];

export function EmailPreferences({ initial }: { initial: EmailPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [, start] = useTransition();
  const flip = (key: keyof EmailPrefs, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    start(async () => {
      try {
        await saveEmailPreferencesAction(next);
      } catch (e) {
        setPrefs(prefs);
        toast(actionErrorText(e) ?? "Not saved. Try again.", "danger");
      }
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        Emails about your orders (quotes, payments, first looks, final files) always arrive. Choose the rest:
      </p>
      <ul className="divide-y divide-border rounded-[var(--r-md)] border border-border">
        {ROWS.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-4 px-[var(--s-4)] py-[var(--s-3)]">
            <span className="min-w-0">
              <span id={`email-${r.key}`} className="block text-[length:var(--fs-3)] font-medium">{r.label}</span>
              <span className="mt-0.5 block text-[length:var(--fs-2)] text-muted-foreground">{r.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[r.key]}
              aria-labelledby={`email-${r.key}`}
              onClick={() => flip(r.key, !prefs[r.key])}
              className={cn(
                "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-[var(--dur-fast)]",
                "before:absolute before:-inset-2 before:content-['']", // 44px tap target
                prefs[r.key] ? "border-foreground bg-foreground" : "border-[color:var(--input)] bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block size-5 rounded-full bg-background shadow-[var(--e-1)] transition-transform duration-[var(--dur-fast)]",
                  prefs[r.key] ? "translate-x-[24px]" : "translate-x-[3px]",
                )}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
