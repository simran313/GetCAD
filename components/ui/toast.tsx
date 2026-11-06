"use client";

import { Check, Info, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Toasts (redesign): one line confirming what just happened ("Role changed to
 * Pod lead"), announced politely, gone in 4 seconds. Never for errors that
 * need a decision; those stay on the page.
 */
type ToastItem = {
  id: number;
  message: string;
  tone: "success" | "info" | "danger" | "live";
  /** R3: a live event ("Your team replied") carries where to go. */
  href?: string;
  action?: string;
};
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: ToastItem["tone"] = "success", link?: { href: string; action?: string }) {
  const id = nextId++;
  // At most three on screen; the oldest goes first.
  items = [...items.slice(-2), { id, message, tone, href: link?.href, action: link?.action }];
  emit();
  // Something that happened elsewhere stays long enough to be read and tapped.
  setTimeout(() => dismiss(id), tone === "live" ? 8000 : 4000);
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
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--chrome-bottom)+27px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-3 rounded-[var(--r-md)] bg-foreground px-4 py-3 text-background shadow-[var(--e-2)]",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--dur-base)]",
          )}
        >
          {t.tone === "live" ? (
            <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-background opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-background" />
            </span>
          ) : t.tone === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : t.tone === "danger" ? (
            <X className="h-4 w-4 shrink-0" />
          ) : (
            <Info className="h-4 w-4 shrink-0" />
          )}
          <p className="flex-1 text-[length:var(--fs-2)] leading-[var(--lh-2)]">{t.message}</p>
          {t.href && (
            <Link
              href={t.href}
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-[var(--r-xs)] px-2 py-1 text-[length:var(--fs-2)] font-semibold underline underline-offset-4 hover:bg-background/10"
            >
              {t.action ?? "Open"}
            </Link>
          )}
          <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded-[var(--r-xs)] p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
