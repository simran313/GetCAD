import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  ["/wallet", "Wallet"],
  ["/wallet/transactions", "Transactions"],
  ["/wallet/invoices", "Invoices"],
] as const;

export function WalletNav({ active }: { active: string }) {
  return (
    <nav aria-label="Wallet" className="border-b border-border">
      <ul className="flex gap-6">
        {TABS.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active === href ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[var(--ctl-sm)] items-center border-b-2 text-[length:var(--fs-2)]",
                active === href ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
