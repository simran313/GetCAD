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

/**
 * The first path segment of every route the app serves outside the public
 * website: the product, sign-in, the API, preview links and the design
 * preview. Requests under these always go through Clerk's middleware, as
 * before. tests/config/route-inventory.test.ts walks app/ and fails if a
 * route is added under a segment missing from this list.
 */
export const APP_ROUTE_SEGMENTS = [
  "account",
  "admin",
  "dashboard",
  "files",
  "home",
  "materials",
  "messages",
  "onboarding",
  "orders",
  "pod",
  "qc",
  "settings",
  "tools",
  "wallet",
  "welcome",
  "work",
  "sign-in",
  "sign-up",
  "login",
  "signup",
  "api",
  "trpc",
  "p",
  "design-preview",
] as const;

/**
 * Whether a request can be served without Clerk's middleware (SEO audit,
 * 12 Nov 2026). A page view (GET or HEAD) of a public website page, or of a
 * path that is not a route at all, needs no session: the public pages never
 * call auth(), and an unknown path renders the 404 page, which does not
 * either. Before this, an unknown path went through Clerk, which on the
 * development instance answered 307 to clerk.accounts.dev instead of 404;
 * Search Console reported those as redirect errors. Anything under an app
 * segment, and every form post, still goes through Clerk exactly as before.
 * The same rule applies to every visitor; nothing depends on who asks.
 */
export function skipsClerk(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (isPublicWebsitePage(pathname)) return true;
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (first === "" || first.startsWith("_next")) return false;
  return !(APP_ROUTE_SEGMENTS as readonly string[]).includes(first.toLowerCase());
}

/** True if `pathname` is behind auth. Matches a prefix exactly or as a segment. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
