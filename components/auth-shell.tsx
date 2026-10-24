import { Wordmark } from "@/components/wordmark";

/**
 * S1 / S2 — the sign-in and sign-up frame (docs/design): the brand panel on
 * the left at desk width, the form on the right. The words are the website's
 * (docs/marketing/LANDING-COPY.md), so they promise only what DECISIONS does.
 */
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] md:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground md:flex">
        <Wordmark />
        <div>
          <p className="font-display text-[56px] leading-[60px] tracking-[-0.01em]">
            Your CAD department,
            <br />
            <em>without the hire.</em>
          </p>
          <ul className="mt-8 space-y-2 text-[length:var(--fs-3)] text-white/80">
            <li>First look within 6 hours of order confirmation, or it&apos;s free</li>
            <li>Every file checked twice: 19 points, two designers</li>
            <li>STL, 3DM and a spec sheet with every order</li>
          </ul>
        </div>
        <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.14em] text-white/60">Jewelry CAD for the trade</p>
      </aside>
      <main className="flex flex-col items-center justify-center gap-6 px-4 py-12">
        <div className="w-full max-w-[400px] md:hidden">
          <Wordmark />
        </div>
        <h1 className="w-full max-w-[400px] font-display text-[length:var(--fs-display)] leading-[var(--lh-display)]">{title}</h1>
        {children}
      </main>
    </div>
  );
}

/** Clerk's components drawn in the portal's look: black, square, Geist. */
export const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#0a0a0a",
    colorText: "#0a0a0a",
    colorTextSecondary: "#52524c",
    colorInputBorder: "#85857e",
    borderRadius: "3px",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full max-w-[400px]",
    card: "shadow-none border border-border w-full",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
};
