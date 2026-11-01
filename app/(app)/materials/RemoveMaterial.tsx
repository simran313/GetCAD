"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { removeMaterialAction } from "./actions";

export function RemoveMaterial({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="ghost" disabled={pending}>
          Remove
        </Button>
      }
      title={`Remove “${title}”?`}
      description="Designers in the pod will no longer see it."
      confirmLabel="Remove"
      destructive
      onConfirm={() =>
        start(async () => {
          try {
            await removeMaterialAction(id);
            router.refresh();
          } catch (e) {
            toast(actionErrorText(e) ?? "Not removed. Try again.", "danger");
          }
        })
      }
    />
  );
}
