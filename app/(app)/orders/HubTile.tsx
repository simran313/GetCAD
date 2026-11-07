"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A card on the client's order page (owner, 7 Nov 2026: cards, not a list):
 * an icon and label, the one fact in large type, a short line under it. The
 * card that matters now (`emphasis`) has a black edge and a lifted shadow.
 * The whole card is the target. With `href` it is a link; otherwise it
 * opens its content in a sheet (full height on a phone, a side panel at
 * desk), so nothing moves to a new route.
 */
const TILE =
  "flex min-h-[112px] w-full min-w-0 flex-col justify-between gap-3 rounded-[var(--r-lg)] border bg-card p-[var(--s-4)] text-left transition-[border-color,box-shadow] hover:border-foreground";

function Face({
  icon,
  label,
  value,
  line,
  badge,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  line: React.ReactNode;
  badge?: number;
  emphasis?: string;
}) {
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[length:var(--fs-2)] font-medium text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {icon}
          {label}
        </span>
        {badge ? (
          <span className="tabular rounded-[var(--r-full)] bg-foreground px-2 text-[length:var(--fs-1)] leading-5 text-background">
            {badge}
            <span className="sr-only"> unread</span>
          </span>
        ) : emphasis ? (
          <span className="rounded-[var(--r-full)] bg-foreground px-2 text-[length:var(--fs-1)] font-medium leading-5 text-background">{emphasis}</span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        {value != null && (
          <span className="tabular block truncate text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[-0.01em]">{value}</span>
        )}
        <span className="block truncate text-[length:var(--fs-2)] text-muted-foreground">{line}</span>
      </span>
    </>
  );
}

export function HubTile({
  icon,
  label,
  value,
  line,
  badge,
  emphasis,
  href,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  /** The one fact, in large type ("$35.00", "10", "0 of 2"). */
  value?: React.ReactNode;
  line: React.ReactNode;
  badge?: number;
  /** The card that matters now, with the word on its chip ("Ready", "To pay"). */
  emphasis?: string;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const look = cn(TILE, emphasis ? "border-foreground shadow-[var(--e-focus)]" : "border-border shadow-[var(--e-1)]", className);
  const face = <Face icon={icon} label={label} value={value} line={line} badge={badge} emphasis={emphasis} />;
  if (href) {
    return (
      <Link href={href} className={look}>
        {face}
      </Link>
    );
  }
  return (
    <Sheet>
      <SheetTrigger className={look}>{face}</SheetTrigger>
      <SheetContent title={label} className="md:max-w-lg" side="auto">
        {children}
      </SheetContent>
    </Sheet>
  );
}
