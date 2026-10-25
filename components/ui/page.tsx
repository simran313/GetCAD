import { cn } from "@/lib/utils";

/**
 * Every portal screen's frame (redesign): one width (--page-max), left-aligned
 * under the sidebar, the same gutters and vertical rhythm on every page.
 */
export function Page({ children, className, narrow = false }: { children: React.ReactNode; className?: string; narrow?: boolean }) {
  return (
    <main className={cn("w-full space-y-6 px-4 py-6 md:px-8 md:py-8", narrow ? "max-w-3xl" : "max-w-page", className)}>{children}</main>
  );
}
