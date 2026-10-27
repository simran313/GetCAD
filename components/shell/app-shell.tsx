"use client";

import { useClerk } from "@clerk/nextjs";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Building2, LogOut, MoreHorizontal, Package, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LiveCallButton } from "@/components/ui/live-call-button";
import { Toaster } from "@/components/ui/toast";
import { activeTabKey, type Tab } from "@/core";
import { cn } from "@/lib/utils";

import { CommandPalette, type PaletteItem } from "./command-palette";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { paletteDataAction } from "./palette-actions";
import { bottomBar, navIcon, ROLE_LABEL, sidebarGroups, type ShellKind } from "./nav-config";
import { Sidebar } from "./sidebar";

/**
 * The signed-in shell (redesign step 5): the sidebar at desk width, a compact
 * top bar and the bottom bar on a phone, Cmd+K everywhere, and for clients a
 * persistent "Talk to your team". Destinations come from core/nav/tabs by
 * role; the palette lists only what this role's own pages already show.
 */
export interface ShellOrder {
  id: string;
  ref: string;
  product: string | null;
  status: string;
}

const COOKIE = "tcp_sidebar";

export function AppShell({
  kind,
  tabs,
  user,
  call,
  initialCollapsed,
  children,
}: {
  kind: ShellKind;
  tabs: Tab[];
  user: { name: string; initials: string; detail: string };
  call: { phone: string | null; hours: string };
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { signOut } = useClerk();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [palette, setPalette] = useState(false);
  // Orders and client codes for Cmd+K, loaded the first time it opens.
  const [{ orders, clients }, setPaletteData] = useState<{ orders: ShellOrder[]; clients: string[] }>({ orders: [], clients: [] });
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  useEffect(() => {
    if (!palette || paletteLoaded) return;
    setPaletteLoaded(true);
    paletteDataAction()
      .then(setPaletteData)
      .catch(() => setPaletteLoaded(false));
  }, [palette, paletteLoaded]);
  const active = activeTabKey(pathname, tabs);
  // An open conversation is a full screen on a phone (Phase 10c): no bars.
  const immersive = /^\/messages\/[^/]+$/.test(pathname);
  const groups = sidebarGroups(kind, tabs);
  const bar = bottomBar(kind, tabs);
  const home = tabs[0]?.href ?? "/home";
  const title = tabs.find((t) => t.key === active)?.label ?? "The CAD Pillar";
  const onSignOut = () => signOut({ redirectUrl: "/" });

  const toggle = () => {
    setCollapsed((c) => {
      document.cookie = `${COOKIE}=${c ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  };

  const orderHref = (id: string) => (kind === "designer" ? `/work/${id}` : `/orders/${id}`);
  const paletteGroups: { heading: string; items: PaletteItem[] }[] = [
    {
      heading: "Go to",
      items: [...tabs.filter((t) => t.key !== "new"), ...(tabs.some((t) => t.key === "account") ? [] : [{ key: "account", label: "Account", href: "/account", icon: "user" as const }])].map((t) => ({
        id: `tab-${t.key}`,
        label: t.label,
        href: t.href,
        icon: navIcon(t.key),
      })),
    },
    ...(bar.create || tabs.some((t) => t.key === "new")
      ? [{ heading: "Actions", items: tabs.filter((t) => t.key === "new").map((t) => ({ id: "act-new", label: t.label, href: t.href, icon: navIcon("new"), keywords: ["create", "new", "order", "brief"] })) }]
      : []),
    {
      heading: kind === "designer" ? "Jobs" : "Orders",
      items: orders.map((o) => ({
        id: `o-${o.id}`,
        label: o.ref,
        hint: o.product ?? undefined,
        href: orderHref(o.id),
        icon: <Package />,
        keywords: [o.status.toLowerCase().replace(/_/g, " ")],
      })),
    },
    ...(clients.length
      ? [{ heading: "Clients", items: clients.map((code) => ({ id: `c-${code}`, label: code, hint: "Client", href: `/admin/clients?q=${encodeURIComponent(code)}`, icon: <Building2 /> })) }]
      : []),
  ];

  return (
    <div style={{ ["--sidebar-w" as string]: collapsed ? "64px" : "240px" }}>
      {/* Keyboard users jump past the navigation straight to the page. */}
      <a
        href="#content"
        className="sr-only z-[70] rounded-[var(--r-sm)] bg-foreground px-4 py-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Sidebar
        groups={groups}
        activeKey={active}
        workspace={ROLE_LABEL[kind]}
        user={{ name: user.name, role: user.detail, initials: user.initials }}
        onSearch={() => setPalette(true)}
        onSignOut={onSignOut}
        collapsed={collapsed}
        onToggle={toggle}
        homeHref={home}
      />

      <div className="min-h-screen bg-[color:var(--app-ground)] transition-[padding] duration-[var(--dur-base)] ease-out md:pl-[var(--sidebar-w)]">
        {/* Phone: a compact top bar. Desk: only for clients, carrying the live call. */}
        <header
          className={cn(
            "sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur",
            kind !== "client" && "md:hidden",
            immersive && "max-md:hidden",
          )}
        >
          <div className="flex h-14 items-center gap-2 px-4 md:px-8">
            <Link href={home} className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] md:hidden">
              {title}
            </Link>
            <div className="hidden flex-1 md:block" />
            {kind === "client" && (
              <>
                <LiveCallButton phone={call.phone} hours={call.hours} className="hidden md:inline-flex" />
                <LiveCallButton phone={call.phone} hours={call.hours} compact className="md:hidden" />
              </>
            )}
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-label="Search and jump"
              className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] text-muted-foreground hover:bg-accent md:hidden"
            >
              <Search className="h-5 w-5" />
            </button>
            <Menu.Root>
              <Menu.Trigger
                aria-label="Your account"
                className="flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-full md:hidden"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">{user.initials}</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-[var(--r-md)] border border-border bg-background p-1 shadow-[var(--e-2)]">
                  <div className="px-2.5 py-2">
                    <p className="text-[15px] font-medium">{user.name}</p>
                    <p className="text-[13px] text-muted-foreground">{user.detail}</p>
                  </div>
                  <Menu.Separator className="my-1 h-px bg-border" />
                  <Menu.Item asChild>
                    <Link href="/account" className="flex h-[var(--ctl-sm)] items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[15px] outline-none data-[highlighted]:bg-accent">
                      <User className="h-4 w-4" /> Account
                    </Link>
                  </Menu.Item>
                  <Menu.Item asChild>
                    <button type="button" onClick={onSignOut} className="flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[15px] outline-none data-[highlighted]:bg-accent">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>

        <div id="content" tabIndex={-1} className={cn("outline-none md:pb-0", !immersive && "pb-[calc(88px+env(safe-area-inset-bottom))]")}>
          {children}
        </div>
      </div>

      {!immersive && (
        <MobileBottomNav
          activeKey={bar.visible.some((v) => v.key === active) ? active : bar.more.some((m) => m.key === active) ? "more" : active}
          create={bar.create}
          items={[
            ...bar.visible,
            {
              key: "more",
              label: "More",
              href: "#more",
              icon: <MoreHorizontal />,
              render: (cls: string) => (
                <Sheet>
                  <SheetTrigger className={cls} aria-current={bar.more.some((m) => m.key === active) ? "page" : undefined}>
                    <MoreHorizontal />
                    <span>More</span>
                  </SheetTrigger>
                  <SheetContent title="More" side="bottom">
                    <nav aria-label="More" className="-mx-2">
                      {[...bar.more, ...(bar.more.some((m) => m.key === "account") ? [] : [{ key: "account", label: "Account", href: "/account", icon: navIcon("account") }])].map((m) => (
                        <SheetClose asChild key={m.key}>
                          <Link
                            href={m.href}
                            aria-current={m.key === active ? "page" : undefined}
                            className="flex min-h-12 items-center gap-3 rounded-[var(--r-sm)] px-2 text-[17px] hover:bg-accent [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-muted-foreground"
                          >
                            {m.icon}
                            {m.label}
                          </Link>
                        </SheetClose>
                      ))}
                      <button type="button" onClick={onSignOut} className="flex min-h-12 w-full items-center gap-3 rounded-[var(--r-sm)] px-2 text-[17px] hover:bg-accent">
                        <LogOut className="h-5 w-5 text-muted-foreground" /> Sign out
                      </button>
                    </nav>
                  </SheetContent>
                </Sheet>
              ),
            },
          ]}
        />
      )}

      <CommandPalette open={palette} onOpenChange={setPalette} groups={paletteGroups} />
      <Toaster />
    </div>
  );
}
