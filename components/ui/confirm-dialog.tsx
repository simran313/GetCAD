"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState } from "react";

import { Button } from "./button";
import { Input } from "./input";

/**
 * Confirmation for an action that cannot be undone (redesign). Destructive
 * actions ask the person to type a word (e.g. "suspend") so a slip of the
 * thumb never suspends anyone. The confirm button is the only red on screen.
 *
 * Works with a server action: pass `formId` (the confirm button submits that
 * form) or `onConfirm`.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  typed,
  destructive = false,
  formId,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Omit when the dialog is opened from elsewhere (a menu item): pass open. */
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  /** A word the person must type before confirming. */
  typed?: string;
  destructive?: boolean;
  formId?: string;
  onConfirm?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (o: boolean) => {
    setOwnOpen(o);
    onOpenChange?.(o);
  };
  const [text, setText] = useState("");
  const id = useId();
  const ready = !typed || text.trim().toLowerCase() === typed.toLowerCase();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
    >
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[var(--r-xl)] border border-border bg-background p-[var(--s-6)] shadow-[var(--e-2)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
          <Dialog.Title className="text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[var(--ls-5)]">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">{description}</Dialog.Description>
          )}
          {typed && (
            <div className="mt-5">
              <label htmlFor={id} className="text-[length:var(--fs-2)] font-medium">
                Type <span className="font-mono">{typed}</span> to confirm
              </label>
              <Input id={id} className="mt-2" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={!ready}
              type="button"
              onClick={() => {
                // Submitted here rather than by type="submit" form={formId}:
                // closing the dialog removes this button from the page before
                // the browser's default action runs, and a detached submit
                // button submits nothing (the confirm silently did nothing).
                if (formId) (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
                onConfirm?.();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
