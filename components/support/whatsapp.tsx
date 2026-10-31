import { c } from "@/content/claims";
import { cn } from "@/lib/utils";

/**
 * WhatsApp, one tap away (owner, 31 Oct 2026): the team's number from
 * content/claims.ts, opened with an optional first line ("About order
 * NT1-RN-C-16: …") so the team knows what it is about. The mark is drawn
 * here (lucide has no brand icons).
 */
export function waLink(text?: string): string {
  const n = String(c("WHATSAPP") ?? "").replace(/\D/g, "");
  if (!n) return "/contact";
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5", className)} fill="currentColor">
      <path d="M12.04 2C6.56 2 2.1 6.45 2.1 11.93c0 1.75.46 3.46 1.33 4.97L2 22l5.24-1.37a9.9 9.9 0 0 0 4.79 1.22h.01c5.48 0 9.93-4.45 9.93-9.93A9.86 9.86 0 0 0 12.04 2Zm0 18.17h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.2 8.2 0 0 1-1.26-4.39c0-4.55 3.7-8.25 8.26-8.25a8.2 8.2 0 0 1 8.24 8.26c0 4.55-3.7 8.23-8.25 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.7-.8-.22-.09-.39-.13-.55.12-.17.25-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42h-.47a.9.9 0 0 0-.66.31c-.22.25-.86.85-.86 2.07s.88 2.4 1.01 2.57c.12.16 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.6.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.11-.23-.17-.48-.3Z" />
    </svg>
  );
}

/**
 * The button. "icon": round, for top bars. "pill": the mark and a label.
 * "float": the round green button that stays in the corner of the website.
 */
export function WhatsAppButton({
  text,
  variant = "pill",
  label = "WhatsApp",
  className,
  tabIndex,
}: {
  text?: string;
  variant?: "icon" | "pill" | "float";
  label?: string;
  className?: string;
  /** -1 while the button sits in a hidden bar (sticky CTA), so focus skips it. */
  tabIndex?: number;
}) {
  const href = waLink(text);
  const external = href.startsWith("https://");
  const common = { href, tabIndex, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) };
  if (variant === "float") {
    return (
      <a
        {...common}
        aria-label="Chat with us on WhatsApp"
        className={cn(
          "fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#128C7E] text-white shadow-[var(--e-2)] transition-transform duration-[var(--dur-fast)] hover:scale-105",
          className,
        )}
      >
        <WhatsAppMark className="h-7 w-7" />
      </a>
    );
  }
  if (variant === "icon") {
    return (
      <a
        {...common}
        aria-label="Chat with us on WhatsApp"
        title="WhatsApp"
        className={cn("inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[#128C7E] hover:bg-accent", className)}
      >
        <WhatsAppMark />
      </a>
    );
  }
  return (
    <a
      {...common}
      className={cn(
        "inline-flex min-h-[var(--ctl)] items-center justify-center gap-2 rounded-[var(--r-md)] border border-border bg-background px-4 text-[length:var(--fs-3)] font-medium hover:bg-accent",
        className,
      )}
    >
      <WhatsAppMark className="text-[#128C7E]" />
      {label}
    </a>
  );
}
