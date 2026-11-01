"use client";

import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { pauseJobAction, resumeJobAction } from "./actions";

/** One tap to pause a job in progress, one to resume it (Phase 13b). */
export function PauseButton({ orderId, paused, size = "sm" }: { orderId: string; paused: boolean; size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={paused ? "default" : "secondary"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await (paused ? resumeJobAction(orderId) : pauseJobAction(orderId));
            router.refresh();
          } catch (e) {
            toast(actionErrorText(e) ?? "Not saved. Try again.", "danger");
          }
        })
      }
    >
      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      {paused ? "Resume" : "Pause"}
    </Button>
  );
}
