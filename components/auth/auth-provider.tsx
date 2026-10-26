import { ClerkProvider } from "@clerk/nextjs";

/**
 * Clerk for the pages that use it: the app ((app)/layout) and the sign-in
 * and sign-up screens ((auth)/layout). The website does not load it: Clerk's
 * browser script is about 300 KB and held up the first paint of the home and
 * pricing pages (Lighthouse in CI). The website header reads the session on
 * the server instead (components/marketing/marketing-header). Route
 * protection is the middleware's and does not depend on this.
 *
 * `signInUrl` / `signUpUrl` / `afterSignOutUrl` are what keep authentication on
 * THIS origin.
 *
 * Unset, Clerk sends an unauthenticated visitor to its hosted Account Portal —
 * `accounts.<your-domain>` or `<slug>.accounts.dev` — which is a different
 * origin. In a browser that is merely a detour. In the installed app it is a
 * loop that never ends:
 *
 *   - the manifest's `scope` is this origin, so the portal is OUTSIDE the app;
 *   - an iOS home-screen app has a storage container SEPARATE from Safari, so
 *     the install starts signed out even when Safari is signed in;
 *   - the portal hands the session back across origins, the container does not
 *     keep it, and /dashboard redirects out again.
 *
 * The symptom is an app that opens to a spinner and reloads forever, with no
 * error anywhere. Pointing these at our own routes keeps every step inside the
 * installed app, where the cookie it sets is the cookie the next request reads.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}
