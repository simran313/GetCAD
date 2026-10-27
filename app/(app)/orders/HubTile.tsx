"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A tile on the client's order page: an icon, a label, one line of state.
 * The whole tile is the target. With `href` it is a link (Chat); otherwise it
 * opens its content in a sheet (full height on a phone, a side panel at
 * desk), so nothing moves to a new route.
 */
const TILE =
  "flex min-h-[88px] w-full min-w-0 flex-col justify-between gap-2 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)] text-left transition-colors hover:border-foreground";

function Face({ icon, label, line, badge }: { icon: React.ReactNode; label: string; line: React.ReactNode; badge?: number }) {
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-medium [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">
          {icon}
          {label}
        </span>
        {badge ? (
          <span className="tabular rounded-[var(--r-full)] bg-foreground px-2 text-[length:var(--fs-1)] leading-5 text-background">
            {badge}
            <span className="sr-only"> unread</span>
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">{line}</span>
    </>
  );
}

export function HubTile({
  icon,
  label,
  line,
  badge,
  href,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  line: React.ReactNode;
  badge?: number;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={cn(TILE, className)}>
        <Face icon={icon} label={label} line={line} badge={badge} />
      </Link>
    );
  }
  return (
    <Sheet>
      <SheetTrigger className={cn(TILE, className)}>
        <Face icon={icon} label={label} line={line} badge={badge} />
      </SheetTrigger>
      <SheetContent title={label} className="md:max-w-lg" side="auto">
        {children}
      </SheetContent>
    </Sheet>
  );
}
