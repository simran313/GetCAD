"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Search, User } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { prefetchTab } from "./nav-config";

/**
 * The portal sidebar (redesign): 240px, grouped, one unique icon per
 * destination, exactly one active row, collapsible to icons (the parent keeps
 * the state). The user block at the foot opens Account and Sign out.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  /** Draw the item yourself (the bottom bar's More sheet), given the cell's classes. */
  render?: (className: string) => React.ReactNode;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function Sidebar({
  groups,
  activeKey,
  workspace,
  user,
  onSearch,
  onSignOut,
  collapsed = false,
  onToggle,
  homeHref = "/home",
}: {
  groups: NavGroup[];
  activeKey: string | null;
  workspace: string;
  user: { name: string; role: string; initials: string };
  onSearch?: () => void;
  onSignOut?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  homeHref?: string;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-background md:flex",
        "transition-[width] duration-[var(--dur-base)] ease-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center")}>
        {!collapsed && (
          <Link href={homeHref} className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 hover:bg-accent">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-xs)] bg-foreground text-[11px] font-semibold text-background">TCP</span>
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">The CAD Pillar</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {onSearch && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onSearch}
            className={cn(
              "flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-sm)] border border-border bg-subtle px-2.5 text-[14px] text-muted-foreground hover:border-[color:var(--border-strong)]",
              collapsed && "justify-center px-0",
            )}
            aria-label="Search and jump (Ctrl K)"
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search or jump to…</span>
                <kbd className="rounded-[var(--r-xs)] border border-border bg-background px-1.5 font-sans text-[12px]">⌘K</kbd>
              </>
            )}
          </button>
        </div>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className={cn(gi > 0 && "mt-5")}>
            {group.label && !collapsed && <p className="eyebrow mb-1.5 px-2.5">{group.label}</p>}
            {group.label && collapsed && gi > 0 && <div className="mx-2 mb-2 border-t border-border" aria-hidden />}
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = item.key === activeKey;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      prefetch={prefetchTab(item.href)}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex h-[var(--ctl-sm)] items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 text-[15px] transition-colors duration-[var(--dur-fast)]",
                        "[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-foreground/[0.06] font-medium text-foreground"
                          : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
                      )}
                    >
                      {active && <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />}
                      {item.icon}
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.badge ? (
                        <span className="tabular rounded-[var(--r-full)] bg-foreground px-1.5 text-[12px] font-medium leading-5 text-background">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <Menu.Root>
          <Menu.Trigger
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] p-1.5 text-left hover:bg-accent focus-visible:outline-none",
              collapsed && "justify-center",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">{user.initials}</span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-5">{user.name}</span>
                  <span className="block truncate text-[13px] leading-4 text-muted-foreground">{user.role === workspace ? workspace : `${workspace} · ${user.role}`}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              </>
            )}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content side="top" align="start" sideOffset={8} className="z-50 min-w-[220px] rounded-[var(--r-md)] border border-border bg-background p-1 shadow-[var(--e-2)]">
              <Menu.Item asChild>
                <Link href="/account" className="flex h-[var(--ctl-sm)] items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[15px] outline-none data-[highlighted]:bg-accent">
                  <User className="h-4 w-4" /> Account
                </Link>
              </Menu.Item>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item asChild>
                <button type="button" onClick={onSignOut} className="flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[15px] outline-none data-[highlighted]:bg-accent">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </aside>
  );
}
