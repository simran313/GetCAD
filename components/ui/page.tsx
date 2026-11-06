import { cn } from "@/lib/utils";

/**
 * Every portal screen's frame (redesign): one width (--page-max), left-aligned
 * under the sidebar, the same gutters and vertical rhythm on every page.
 * `form` keeps the header on the page width but holds the content below it to
 * a readable measure, so a form's fields never stretch across a wide screen.
 */
export function Page({ children, className, form = false }: { children: React.ReactNode; className?: string; form?: boolean }) {
  return (
    // R3: a new page arrives with a short rise (200 ms), so a tap visibly
    // lands somewhere. No fade: starting at opacity 0 held back the first
    // paint of the page's main content by about 250 ms (R6 speed check,
    // tests/e2e/zz-speed.e2e.ts). Off under reduced motion.
    <main
      className={cn(
        "w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8",
        "animate-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none",
        form && "[&>*:not(header)]:max-w-2xl",
        className,
      )}
    >
      {children}
    </main>
  );
}
