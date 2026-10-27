import Link from "next/link";

import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

import type { WalletLine } from "./load";
import { viewerZone } from "@/lib/time/zone";
import { formatDate } from "@/core";

export async function Lines({ lines }: { lines: WalletLine[] }) {
  const tz = await viewerZone();
  if (lines.length === 0) {
    return <Card className="p-[var(--s-8)] text-center text-[length:var(--fs-3)] text-muted-foreground">No activity yet.</Card>;
  }
  return (
    <Card>
      <ul>
        {lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0">
            <span className="min-w-0">
              <span className="block text-[length:var(--fs-3)]">{l.label}</span>
              <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">
                {l.orderId ? <Link href={`/orders/${l.orderId}`} className="hover:underline">{l.detail}</Link> : l.detail} ·{" "}
                {formatDate(l.at, tz)}
              </span>
            </span>
            <span className="tabular shrink-0 font-mono text-[length:var(--fs-3)]">
              {l.amount > 0 ? "+" : "−"}
              {formatMoney(Math.abs(l.amount), l.currency)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
