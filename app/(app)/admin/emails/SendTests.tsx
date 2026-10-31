"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { sendTestEmailsAction } from "./actions";

export function SendTests({ count, to }: { count: number; to: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await sendTestEmailsAction();
            toast(r.failed ? `${r.sent} sent, ${r.failed} failed (see the outbox).` : `${r.sent} test emails sent to ${r.to}.`, r.failed ? "danger" : undefined);
          } catch (e) {
            toast(actionErrorText(e) ?? "Not sent. Is email configured?", "danger");
          }
        })
      }
    >
      {pending ? "Sending…" : `Send all ${count} to ${to}`}
    </Button>
  );
}
