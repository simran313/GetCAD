import { Plus } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { NavItem } from "./sidebar";

/**
 * The phone's navigation (redesign): up to four destinations and one raised
 * Create button in the middle. 56px tall plus the home-indicator inset;
 * labels always shown (icons alone are guesswork at arm's length).
 */
export function MobileBottomNav({
  items,
  activeKey,
  create,
}: {
  items: NavItem[];
  activeKey: string | null;
  create?: { href: string; label: string };
}) {
  const half = Math.ceil(items.length / 2);
  const left = create ? items.slice(0, half) : items;
  const right = create ? items.slice(half) : [];
  const cell = (item: NavItem) => {
    const active = item.key === activeKey;
    return (
      <li key={item.key} className="flex-1">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium [&_svg]:h-[22px] [&_svg]:w-[22px]",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item.icon}
          <span className="max-w-full truncate px-1">{item.label}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {left.map(cell)}
        {create && (
          <li className="flex flex-1 items-center justify-center">
            <Link
              href={create.href}
              aria-label={create.label}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[var(--e-2)] active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </Link>
          </li>
        )}
        {right.map(cell)}
      </ul>
    </nav>
  );
}
