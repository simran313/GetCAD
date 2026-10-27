import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import Link from "next/link";

import { AuthProvider } from "@/components/auth/auth-provider";
import { TimeZoneProvider } from "@/components/time-zone";
import { ConnectionStatus } from "@/components/pwa/connection-status";
import { AppShell, type ShellOrder } from "@/components/shell/app-shell";
import { ROLE_LABEL, shellKind } from "@/components/shell/nav-config";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { POST_AUTH_PATH } from "@/config/auth-redirects";
import { c, showClaim } from "@/content/claims";
import { tabsForRole } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

/**
 * Chrome for the authenticated product (client / designer / staff). Kept
 * separate from the marketing layout so the two are visually and structurally
 * isolated — this header never renders on a marketing page, and vice versa.
 *
 * Navigation is ROLE-SCOPED. It once rendered Dashboard, Orders, Staff and
 * Designers to every signed-in user, which showed customers that internal
 * tooling exists. Those pages were never reachable — the database refuses them —
 * but advertising a door you cannot open is still a disclosure, and an
 * anonymity-critical product should not be making it.
 *
 * Which tabs a role gets is decided in `core/nav/tabs`, unit-tested, so the
 * rule cannot quietly drift as screens are added.
 *
 * THE SHELL. One navigation, drawn two ways, never both at once:
 *
 *   - below 768px  — a slim header carrying only the wordmark and the account
 *                    control, and the bottom tab bar doing the navigating.
 *   - 768px and up — a persistent left sidebar. This is the change: desktop
 *                    used to navigate from a row of text links in the header,
 *                    which is the shape of a website, not of an app. The
 *                    destinations are identical; only their drawing differs.
 *
 * Signed out there is no role and nothing to navigate to, so the header keeps
 * its full-width form with Sign in / Get started and no shell appears at all.
 *
 * REDESIGN (step 5): the shell itself is components/shell/app-shell — a
 * grouped 240px sidebar (collapsible; the state is a cookie so the page does
 * not jump), a compact top bar and a five-slot bottom bar on a phone, Cmd+K,
 * and "Talk to your team" for clients. The palette lists orders through
 * visible_orders() — the same per-role, reference-only read the order lists
 * use — so it never shows anyone more than their own pages do.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TimeZoneProvider zone={await viewerZone()}>
        <AppChrome>{children}</AppChrome>
      </TimeZoneProvider>
    </AuthProvider>
  );
}

async function AppChrome({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="min-h-screen bg-[color:var(--app-ground)]">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="container flex h-14 items-center justify-between">
            <Link href="/" aria-label="The CAD Pillar — home">
              <Wordmark />
            </Link>
            <nav className="flex items-center gap-1">
              <SignedOut>
                <SignInButton mode="modal" fallbackRedirectUrl={POST_AUTH_PATH}>
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal" fallbackRedirectUrl={POST_AUTH_PATH}>
                  <Button size="sm">Get started</Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </nav>
          </div>
        </header>
        <ConnectionStatus className="top-14" />
        {children}
      </div>
    );
  }

  const supabase = await createUserSupabaseClient();
  const [{ data: me }, ordersRes, jar] = await Promise.all([
    supabase.from("users").select("role").maybeSingle(),
    supabase.rpc("visible_orders").select("id, display_ref, product_type, status").limit(200),
    cookies(),
  ]);
  const role = me?.role ?? "CLIENT";
  const kind = shellKind(role);
  const tabs = tabsForRole(role);

  // The name in the user block, from the person's own profile row (each
  // readable only by its owner), not from Clerk, so no page load waits on
  // Clerk's API.
  const profile =
    kind === "client"
      ? await supabase.from("client_profiles").select("business_name, legal_name").maybeSingle()
      : kind === "designer"
        ? await supabase.from("designer_profiles").select("legal_name").maybeSingle()
        : await supabase.from("staff_profiles").select("first_name").eq("user_id", userId).maybeSingle();
  const p = (profile.data ?? {}) as { business_name?: string | null; legal_name?: string | null; first_name?: string | null };

  // Client codes for Cmd+K: admins only (admin_clients refuses anyone else).
  let clients: string[] = [];
  if (kind === "staff") {
    const res = await supabase.rpc("admin_clients").select("client_code");
    clients = ((res.data ?? []) as { client_code: string | null }[]).flatMap((r) => (r.client_code ? [r.client_code] : []));
  }

  const name = p.first_name || p.business_name || p.legal_name || "Your account";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const orders: ShellOrder[] = ((ordersRes.data ?? []) as { id: string; display_ref: string | null; product_type: string | null; status: string }[]).map((o) => ({
    id: o.id,
    ref: o.display_ref ?? o.id,
    product: o.product_type,
    status: o.status,
  }));

  return (
    <AppShell
      kind={kind}
      tabs={tabs}
      user={{ name, initials, detail: ROLE_LABEL[kind] }}
      orders={orders}
      clients={clients}
      call={{ phone: c("LIVE_CALL_PHONE"), hours: showClaim("LIVE_CALL_HOURS") ? c("LIVE_CALL_HOURS") : "US business hours" }}
      initialCollapsed={jar.get("tcp_sidebar")?.value === "collapsed"}
    >
      {/* Above everything else, so the answer to "did that save?" is on
          screen before the question is asked. */}
      <ConnectionStatus className="top-14 md:top-0" />
      {children}
    </AppShell>
  );
}
