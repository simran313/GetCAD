// Order-status presentation metadata — framework-free (no next/react), so it can
// be unit-tested and shared. Tone drives the functional status colour; label is
// the human-readable name. Colour here carries information (state), not mood.

export type StatusTone = "neutral" | "info" | "attention" | "success" | "danger";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export const ORDER_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  QUOTED: { label: "Quoted", tone: "info" },
  PAYMENT_HELD: { label: "Payment held", tone: "info" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  DESIGNER_SUBMITTED: { label: "Work submitted", tone: "info" },
  QC_REVIEW: { label: "In QC review", tone: "info" },
  REVISION_REQUESTED: { label: "Revision requested", tone: "attention" },
  CLIENT_PREVIEW: { label: "Ready to preview", tone: "attention" },
  APPROVED: { label: "Approved", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CLOSED: { label: "Closed", tone: "success" },
  PAYOUT_RELEASED: { label: "Payout released", tone: "success" },
  DISPUTED: { label: "Disputed", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

/** Metadata for a status, with a safe humanised fallback for unknown values. */
export function statusMeta(status: string): StatusMeta {
  return (
    ORDER_STATUS_META[status] ?? {
      label: status
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase()),
      tone: "neutral",
    }
  );
}

/**
 * The four tags of the mockups (docs/design): what a status asks of the
 * reader, drawn in black and greys.
 *   needs   solid black — someone must act (a revision, a preview, a dispute)
 *   active  black outline — in flight, nothing owed by the reader
 *   done    black with a tick — it landed
 *   muted   grey — nothing happening, or it ended without landing
 */
export type StatusKind = "needs" | "active" | "done" | "muted";

const KIND_BY_TONE: Record<StatusTone, StatusKind> = {
  attention: "needs",
  info: "active",
  success: "done",
  neutral: "muted",
  danger: "needs",
};

/** The tag a status shows. Refunded and cancelled orders are over, so muted. */
export function statusKind(status: string): StatusKind {
  if (status === "REFUNDED" || status === "CANCELLED") return "muted";
  return KIND_BY_TONE[statusMeta(status).tone];
}
