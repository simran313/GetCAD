import { statusMeta } from "@/core";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";

/** An order status as a StatusPill, from core/orders/status (label and tone). */
const TONE: Record<string, PillTone> = {
  neutral: "neutral",
  info: "info",
  attention: "attention",
  success: "success",
  danger: "danger",
};

/** Ended without landing: shown quietly. Red is kept for what needs action (Disputed). */
const QUIET = new Set(["REFUNDED", "CANCELLED"]);

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  return (
    <StatusPill tone={QUIET.has(status) ? "neutral" : (TONE[meta.tone] ?? "neutral")} className={className}>
      {meta.label}
    </StatusPill>
  );
}
