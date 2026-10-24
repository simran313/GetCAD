import { statusKind, statusMeta } from "@/core";
import { StatusTag } from "@/components/ui/status-tag";

/**
 * The order status, as the mockups draw it (docs/design): one of four tags —
 * solid black when someone must act, outlined while in flight, a tick when
 * done, grey otherwise. Which status is which lives in core/orders/status
 * (statusKind); the label is always present, so nothing rests on shade alone.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <StatusTag kind={statusKind(status)} className={className}>
      {statusMeta(status).label}
    </StatusTag>
  );
}
