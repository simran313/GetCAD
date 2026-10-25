"use client";

import { Check, Info, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Toasts (redesign): one line confirming what just happened ("Role changed to
 * Pod lead"), announced politely, gone in 4 seconds. Never for errors that
 * need a decision; those stay on the page.
 */
type ToastItem = { id: number; message: string; tone: "success" | "info" | "danger" };
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: ToastItem["tone"] = "success") {
  const id = nextId++;
  items = [...items, { id, message, tone }];
  emit();
  setTimeout(() => dismiss(id), 4000);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Place once per layout. Shows a toast passed in the URL (?toast=…) too. */
export function Toaster({ initial }: { initial?: string | null }) {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  useEffect(() => {
    if (initial) toast(initial);
  }, [initial]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-3 rounded-[var(--r-md)] bg-foreground px-4 py-3 text-background shadow-[var(--e-2)]",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--dur-base)]",
          )}
        >
          {t.tone === "success" ? <Check className="h-4 w-4 shrink-0" /> : t.tone === "danger" ? <X className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          <p className="flex-1 text-[length:var(--fs-2)] leading-[var(--lh-2)]">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded-[var(--r-xs)] p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
