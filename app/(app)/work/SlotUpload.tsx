"use client";

import { Circle, CircleCheck, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";
import { cn } from "@/lib/utils";

import { beginSlotUploadAction, finishSlotUploadAction } from "../orders/fileActions";

type Phase = { kind: "idle" } | { kind: "sending"; pct: number } | { kind: "checking" };

/** PUT the file to the one-off storage address, reporting progress. */
function send(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("upload failed — check the connection and try again"));
    xhr.send(file);
  });
}

/**
 * One deliverable (Phase 13a): choose or drop a file and it uploads, straight
 * from the browser to storage (no size limit from the app server), then the
 * server checks and cleans it into the slot. No second button to press.
 */
export function SlotUpload({
  orderId,
  code,
  label,
  hint,
  accept,
  fileName,
  enabled,
}: {
  orderId: string;
  code: string;
  label: string;
  hint?: string;
  accept: string;
  fileName: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const busy = phase.kind !== "idle";

  async function upload(file: File) {
    if (busy) return;
    setPhase({ kind: "sending", pct: 0 });
    try {
      const { url, key } = await beginSlotUploadAction(orderId, code, file.size);
      await send(url, file, (pct) => setPhase({ kind: "sending", pct }));
      setPhase({ kind: "checking" });
      await finishSlotUploadAction(orderId, code, key, file.name, file.type);
      toast(`${label} uploaded`);
      router.refresh();
    } catch (e) {
      toast(actionErrorText(e) ?? (e instanceof Error ? e.message : "Upload failed"), "danger");
    } finally {
      setPhase({ kind: "idle" });
      if (input.current) input.current.value = "";
    }
  }

  const status =
    phase.kind === "sending" ? `Uploading ${phase.pct}%` : phase.kind === "checking" ? "Checking and cleaning…" : (fileName ?? "Not uploaded yet");

  return (
    <li
      className={cn(
        "flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center",
        over && "rounded-[var(--r-md)] bg-subtle outline outline-1 outline-[color:var(--border-strong)]",
      )}
      onDragOver={(e) => {
        if (!enabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!enabled) return;
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void upload(file);
      }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {busy ? (
          <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : fileName ? (
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--tone-success-fg)]" aria-label="Uploaded" />
        ) : (
          <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Empty" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-3)] font-medium leading-[var(--lh-3)]">{label}</p>
          {hint && <p className="text-[length:var(--fs-2)] text-muted-foreground">{hint}</p>}
          <p className="truncate font-mono text-[length:var(--fs-2)] text-muted-foreground" aria-live="polite">
            {status}
          </p>
          {phase.kind === "sending" && (
            <div className="mt-2 h-1 overflow-hidden rounded-[var(--r-full)] bg-subtle" aria-hidden>
              <div className="h-full bg-foreground transition-[width]" style={{ width: `${phase.pct}%` }} />
            </div>
          )}
        </div>
      </div>
      {enabled && (
        <>
          <input
            ref={input}
            type="file"
            accept={accept}
            aria-label={`File for ${code}`}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <Upload aria-hidden />
            {fileName ? "Replace" : "Upload"}
          </Button>
        </>
      )}
    </li>
  );
}
