import { cn } from "@/lib/utils";

/**
 * Every portal screen's frame (redesign): one width (--page-max), left-aligned
 * under the sidebar, the same gutters and vertical rhythm on every page.
 * `form` keeps the header on the page width but holds the content below it to
 * a readable measure, so a form's fields never stretch across a wide screen.
 */
export function Page({ children, className, form = false }: { children: React.ReactNode; className?: string; form?: boolean }) {
  return (
    <main className={cn("w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8", form && "[&>*:not(header)]:max-w-2xl", className)}>
      {children}
    </main>
  );
}
