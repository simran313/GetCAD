"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/nav/icons";
import { Wordmark } from "@/components/wordmark";
import { activeTabKey, type Tab, type Workspace } from "@/core";
import { cn } from "@/lib/utils";

/**
 * The sidebar — the same navigation as the bottom bar, at desk width, drawn
 * as the mockups draw it (docs/design C1, A1, P1): the wordmark, a mono
 * workspace label, one row per destination, the account at the foot.
 *
 * White for clients and designers, black for the team (core/nav/tabs
 * workspaceFor), so someone who is staff and also a client can tell which
 * hat is on. Destinations still come from `core/nav/tabs`, by role.
 *
 * `hidden md:flex` — one navigation on screen at a time. Below 768px the
 * bottom bar is the navigation; the two never coexist.
 */
export function SideNav({ tabs, workspace }: { tabs: Tab[]; workspace: Workspace }) {
  const pathname = usePathname() ?? "";
  const active = activeTabKey(pathname, tabs);
  const dark = workspace.tone === "dark";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r px-5 pb-6 pt-8 md:flex",
        dark ? "border-[#1f1f1f] bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
      )}
    >
      <div className="px-3">
        <Link href={tabs[0]?.href ?? "/home"} aria-label="The CAD Pillar — home">
          <Wordmark />
        </Link>
        <p
          className={cn(
            "mt-3 font-mono text-[length:var(--fs-1)] uppercase leading-none tracking-[0.16em]",
            dark ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {workspace.label}
        </p>
      </div>

      <nav aria-label="Main" className="mt-10 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[var(--ctl-sm)] items-center gap-3.5 rounded-[var(--r-sm)] px-3",
                    "text-[length:var(--fs-3)] leading-[var(--lh-3)] transition-colors duration-[var(--dur-fast)]",
                    dark
                      ? isActive
                        ? "bg-white/[0.12] font-medium text-white"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                      : isActive
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <NavIcon icon={tab.icon} className="h-5 w-5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("flex items-center gap-3 border-t px-3 pt-4", dark ? "border-white/15" : "border-border")}>
        <UserButton />
        <span className={cn("text-[length:var(--fs-2)]", dark ? "text-white/70" : "text-muted-foreground")}>
          Signed in
        </span>
      </div>
    </aside>
  );
}
