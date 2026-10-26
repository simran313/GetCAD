import { cn } from "@/lib/utils";

/**
 * Every portal screen's frame (redesign): one width (--page-max), left-aligned
 * under the sidebar, the same gutters and vertical rhythm on every page.
 */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8", className)}>{children}</main>;
}
