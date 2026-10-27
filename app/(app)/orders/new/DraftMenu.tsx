"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { transitionAction } from "../actions";

/**
 * A draft's overflow (New order screen): Delete, behind a confirmation. A
 * draft is deleted the way any order before a price is cancelled
 * (transition_order DRAFT → CANCELLED); nothing else changes.
 */
export function DraftMenu({ orderId, name }: { orderId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const formId = useId();
  const item = "flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[length:var(--fs-2)] outline-none data-[highlighted]:bg-accent";
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={`More for ${name}`}
          className="relative z-10 inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[180px] rounded-[var(--r-md)] border border-border bg-background p-1 shadow-[var(--e-2)]">
            <Menu.Item className={item} onSelect={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete draft
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <form id={formId} action={transitionAction} hidden>
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="to_status" value="CANCELLED" />
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        destructive
        formId={formId}
      />
    </>
  );
}
