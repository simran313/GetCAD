"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { CircleAlert, MoreHorizontal, Trash2, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { raiseDisputeAction, transitionAction } from "./actions";
import { actionErrorText } from "@/lib/refusal";

/**
 * An order's overflow for its client: the rare, weighty actions kept off the
 * main screen. Cancel (or Delete, for a draft) goes through a confirmation and
 * the same transition_order call as before (→ CANCELLED); "Raise a problem"
 * opens the existing dispute form in a sheet. Nothing here decides who may do
 * what: the database still refuses anything out of state or role.
 */
export function OrderMenu({
  orderId,
  name,
  cancel = null,
  problem = false,
}: {
  orderId: string;
  name: string;
  /** "Delete draft" on a draft, "Cancel order" before payment; null when not allowed. */
  cancel?: "Delete draft" | "Cancel order" | null;
  problem?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const formId = useId();
  if (!cancel && !problem) return null;
  const item =
    "flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[length:var(--fs-2)] outline-none data-[highlighted]:bg-accent";
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
            {problem && (
              <Menu.Item className={item} onSelect={() => setReporting(true)}>
                <CircleAlert className="h-4 w-4" aria-hidden /> Raise a problem
              </Menu.Item>
            )}
            {cancel && (
              <Menu.Item className={item} onSelect={() => setConfirming(true)}>
                {cancel === "Delete draft" ? <Trash2 className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />} {cancel}
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {cancel && (
        <>
          <form id={formId} action={transitionAction} hidden>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="to_status" value="CANCELLED" />
          </form>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={cancel === "Delete draft" ? "Delete this draft?" : "Cancel this order?"}
            confirmLabel={cancel}
            destructive
            formId={formId}
          />
        </>
      )}
      {problem && (
        <Sheet open={reporting} onOpenChange={setReporting}>
          <SheetContent title="Raise a problem" side="auto">
            <form
              action={async (fd) => {
                try {
                  await raiseDisputeAction(fd);
                  setReporting(false);
                  toast("Sent to the team");
                } catch (e) {
                  toast(actionErrorText(e) ?? "Not sent. Try again.", "danger");
                }
              }}
              className="space-y-3"
            >
              <input type="hidden" name="order_id" value={orderId} />
              <Textarea name="reason" required rows={4} maxLength={2000} placeholder="What went wrong?" aria-label="The problem" />
              <Button type="submit" className="w-full sm:w-auto">
                Send to the team
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
