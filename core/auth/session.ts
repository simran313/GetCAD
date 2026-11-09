/**
 * Pure route-protection logic, shared by the Next.js middleware.
 *
 * Kept in `core/` (framework-free) so the single most security-relevant
 * decision in the app — "does this path require a logged-in user?" — is plain,
 * testable logic rather than something buried in middleware glue. The middleware
 * imports this; the test exercises the exact same function.
 */

/**
 * Path prefixes that require an authenticated session.
 *
 * This list had drifted behind the routes: `/admin`, `/settings`, `/onboarding`
 * and (as of the account screen) `/account` were all reachable by the
 * middleware and relying entirely on each page's own `auth()` guard to redirect.
 * Those guards are correct and are the real control — this is the layer in
 * front, and defence in depth only works while both layers are in place. A new
 * page added under an existing prefix now inherits protection instead of
 * needing to remember it.
 *
 * `/api/webhooks/*` is deliberately absent: Razorpay is server-to-server and
 * carries no session, so putting it behind auth would silently break every
 * payment. Its security is the HMAC signature.
 */
export const PROTECTED_PREFIXES = [
  "/home",
  "/welcome",
  "/messages",
  "/wallet",
  "/files",
  "/dashboard",
  "/orders",
  "/account",
  "/admin",
  "/settings",
  "/onboarding",
  "/work",
  "/qc",
  "/pod",
] as const;

/**
 * The public website's pages (8 Nov 2026). A page view of these needs no
 * sign-in check on the server: the header reads the session cookie in the
 * browser, and nothing on them calls auth() while rendering. Clerk's
 * middleware is skipped for a GET or HEAD of these, because with a
 * development instance it sends every first-time browser (search engines'
 * renderers included) through a redirect to clerk.accounts.dev and back.
 * Their form posts (server actions) still go through Clerk.
 */
export const PUBLIC_WEBSITE_PAGES = [
  "/",
  "/jewelry-cad",
  "/how-it-works",
  "/pricing",
  "/guarantee",
  "/quality",
  "/faq",
  "/contact",
  "/apply-designer",
  "/privacy",
  "/terms",
  "/results",
  "/offline",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
] as const;

export function isPublicWebsitePage(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (PUBLIC_WEBSITE_PAGES as readonly string[]).includes(path);
}

/** True if `pathname` is behind auth. Matches a prefix exactly or as a segment. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
