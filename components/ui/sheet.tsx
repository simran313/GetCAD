"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A sheet (redesign): from the bottom on a phone, from the right at desk.
 * The phone's answer to a modal; also the order "detail drawer" on lists.
 */
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  title,
  description,
  children,
  className,
  side = "auto",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** auto: bottom below 768px, right from 768px. */
  side?: "auto" | "right" | "bottom";
}) {
  const position =
    side === "right"
      ? "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=open]:slide-in-from-right"
      : side === "bottom"
        ? "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[var(--r-xl)] border-t data-[state=open]:slide-in-from-bottom"
        : [
            "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[var(--r-xl)] border-t data-[state=open]:slide-in-from-bottom",
            "md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0 md:data-[state=open]:slide-in-from-right",
          ].join(" ");
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border-border bg-background shadow-[var(--e-2)] outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-[var(--dur-slow)]",
          position,
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 border-b border-border px-[var(--s-5)] py-[var(--s-4)]">
          <div className="min-w-0">
            <Dialog.Title className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Details"}</Dialog.Description>
            )}
          </div>
          <Dialog.Close className="-mr-2 inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </Dialog.Close>
        </div>
        {/* Focusable so a keyboard can scroll it when nothing inside takes focus (a read-only timeline). */}
        <div
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-[var(--s-5)] py-[var(--s-5)] pb-[max(var(--s-5),env(safe-area-inset-bottom))] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
