import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { StatusTag } from "@/components/ui/status-tag";
import { SectionLabel } from "@/components/work/stats";

/**
 * Spec claims waiting on the team (A6, claims_queue in 0051): open ones in
 * the viewer's pods; for an admin also the ones sent to admin review. A
 * designer with upheld claims in the last 90 days is flagged.
 */
export interface ClaimQueueRow {
  id: string;
  order_id: string;
  order_ref: string | null;
  client_code: string | null;
  designer_ref: string | null;
  spec: string;
  status: string;
  hash_match: boolean;
  created_at: string;
  designer_upheld_90d: number;
}

export function ClaimsQueue({ rows }: { rows: ClaimQueueRow[] }) {
  const waiting = rows.filter((r) => r.status === "open" || r.status === "admin_review");
  if (waiting.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionLabel>Spec claims · {waiting.length}</SectionLabel>
      <Card className="overflow-hidden">
        {waiting.map((r) => (
          <ListRow
            key={r.id}
            href={`/orders/${r.order_id}#claims`}
            reference={[r.order_ref, r.client_code, r.designer_ref].filter(Boolean).join(" · ")}
            title={`${r.spec.replace("_", " ")} claim`}
            meta={[
              r.hash_match ? "file matches" : "file does not match",
              r.designer_upheld_90d > 0 ? `designer: ${r.designer_upheld_90d} upheld in 90 days` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            trailing={<StatusTag kind="needs">{r.status === "admin_review" ? "Admin review" : "Re-measure"}</StatusTag>}
          />
        ))}
      </Card>
    </section>
  );
}
