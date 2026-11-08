import { cn } from "@/lib/utils";

/**
 * Every portal screen's frame (redesign): one width (--page-max, wider on a
 * large screen), centred in the space beside the sidebar (owner, 8 Nov 2026:
 * left-aligned, a big screen showed a wide empty band on the right), the same
 * gutters and vertical rhythm on every page.
 * `form` keeps the header on the page width but holds the content below it to
 * a readable measure, so a form's fields never stretch across a wide screen.
 */
export function Page({ children, className, form = false }: { children: React.ReactNode; className?: string; form?: boolean }) {
  return (
    // No entrance animation on the page itself. Any transform on <main>
    // (R3's rise) makes it the frame for the fixed bars inside it, so on a
    // phone the order's Download bar, the brief's Next and the save bars sat
    // mid-page until the animation ended, then jumped to the screen's foot
    // (R6: layout shift 0.096 on the phone order page). The top progress bar
    // (nav-progress) is what shows a tap landed.
    <main
      className={cn(
        "mx-auto w-full max-w-page space-y-6 px-4 py-6 md:px-8 md:py-8",
        form && "[&>*:not(header)]:max-w-2xl",
        className,
      )}
    >
      {children}
    </main>
  );
}
