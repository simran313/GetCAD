import type { StatusKind } from "@/core";

import { StatusPill, type PillTone } from "./status-pill";

/**
 * The four tags the screens ask for, drawn as the redesign's StatusPill:
 * needs → attention (black), active → info, done → success, muted → neutral.
 */
const TONE: Record<StatusKind, PillTone> = {
  needs: "attention",
  active: "info",
  done: "success",
  muted: "neutral",
};

export function StatusTag({
  kind,
  children,
  className,
}: {
  kind: StatusKind;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StatusPill tone={TONE[kind]} className={className}>
      {children}
    </StatusPill>
  );
}
