import { unconfirmedClaims } from "@/content/claims";

/**
 * Preview builds only: lists the claims on this page nobody has confirmed
 * yet (content/claims.ts). Never rendered on the production deployment.
 */
export function DraftClaimsBanner() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return null;
  const open = unconfirmedClaims();
  if (open.length === 0) return null;
  return (
    <aside className="border-b border-[color:var(--tone-warning-line)] bg-[color:var(--tone-warning-bg)] px-4 py-3 text-[14px] text-[color:var(--tone-warning-fg)]">
      <details className="mx-auto max-w-[1200px]">
        <summary className="cursor-pointer font-medium">
          Draft: {open.length} claims on this site are not confirmed yet. Confirm them in content/claims.ts before launch. (This banner never shows in production.)
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {open.map((o) => (
            <li key={o.key}>
              <span className="font-mono">{o.key}</span>: {o.todo}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
