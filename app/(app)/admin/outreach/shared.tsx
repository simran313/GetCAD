import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

/** The outreach screens' own links, under the page title. */
export type OutreachSection = "dashboard" | "today" | "import" | "new" | "templates" | "senders" | "guide";

export function OutreachNav({ current, isAdmin }: { current: OutreachSection; isAdmin: boolean }) {
  const links = [
    { key: "dashboard", href: "/admin/outreach", label: "Dashboard" },
    { key: "today", href: "/admin/outreach/today", label: "Today" },
    { key: "new", href: "/admin/outreach/new", label: "Add contact" },
    { key: "import", href: "/admin/outreach/import", label: "Import a list" },
    { key: "templates", href: "/admin/outreach/templates", label: "Templates" },
    ...(isAdmin ? [{ key: "senders", href: "/admin/outreach/senders", label: "Senders" }] : []),
    { key: "guide", href: "/admin/outreach/guide", label: "How it works" },
  ];
  return (
    <nav aria-label="Outreach" className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={current === l.key ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] transition-colors",
            current === l.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** What a teammate without outreach access, or a failed read, sees. */
export function OutreachUnavailable({ message }: { message: string }) {
  const denied = /outreach is for admins and sales|only an admin/i.test(message);
  return (
    <Page>
      <PageHeader title="Outreach" />
      <Card className="p-[var(--s-5)] text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
        {denied ? "Outreach is for admins and the sales team. Ask an admin to give you the Sales role." : `Couldn't load outreach: ${message}`}
      </Card>
    </Page>
  );
}

export const th = "px-[var(--s-4)] py-[var(--s-3)] font-normal";
export const td = "px-[var(--s-4)] py-[var(--s-3)] align-top";
