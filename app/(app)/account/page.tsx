import { auth, currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { ChevronRight, KeyRound, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InstallHint } from "@/components/pwa/install-hint";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { TimeZoneSetting } from "@/components/time-zone";
import { Button } from "@/components/ui/button";
import { CopyableID } from "@/components/ui/copyable-id";
import { FilePicker } from "@/components/ui/file-picker";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { pushIsConfiguredForBrowser } from "@/config/push";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ORDER_FILES_BUCKET } from "@/config/supabase";

import { uploadLogoAction } from "../orders/previewActions";

import { ClientProfileForm, type ClientProfile } from "./ClientProfileForm";

/**
 * Account.
 *
 * The fourth tab in every role's navigation, and the only screen that talks
 * about the viewer rather than about work. It is deliberately thin: identity,
 * what the account can do, the way out.
 *
 * Note what it does NOT show. There is no "profile" here in the social sense —
 * no photo, no bio, no display name shown to anyone else. A designer's identity
 * is never rendered to a client and vice versa, so a profile page would be a
 * screen for editing something nobody can see. What people actually need is
 * their role (which explains why the rest of the app looks the way it does) and
 * the settings that have real consequences.
 *
 * Redesign: identity first (name, roles as chips, status, reference), then
 * the client's business and logo, sign-in and security, notifications, and
 * Sign out as a real button. Left-aligned on the page width like every
 * other screen.
 */
export const dynamic = "force-dynamic";

// The viewer's own roles, in the words the rest of the app uses.
const ROLE_WORD: Record<string, string> = {
  CLIENT: "Client",
  DESIGNER: "Designer",
  QC: "Pod lead",
  OPS: "Ops",
  SALES: "Sales",
  FINANCE: "Finance",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const [{ data }, { data: grants }] = await Promise.all([
    supabase.from("users").select("role, status").maybeSingle(),
    supabase.from("user_roles").select("role"),
  ]);

  const role: string = data?.role ?? "CLIENT";
  const status: string = data?.status ?? "PENDING";
  const roles = [role, ...((grants ?? []) as { role: string }[]).map((g) => g.role).filter((r) => r !== role)];

  // Read here rather than in the client component: an unconfigured deployment
  // should show nothing at all, not a button that fails when pressed.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  // C9: a client edits their business details here (Phase 5b).
  const isClient = role === "CLIENT";
  const { data: profile } = isClient
    ? await supabase.from("client_profiles").select("business_name, legal_name, email, phone, logo_object_key").maybeSingle()
    : { data: null };
  const { data: account } = isClient
    ? await supabase.from("client_accounts").select("client_code").maybeSingle()
    : { data: null };
  const email = isClient ? (await currentUser())?.primaryEmailAddress?.emailAddress ?? null : null;
  const pushOffered = pushIsConfiguredForBrowser(vapidPublicKey);
  // Phase 7b: the logo shown on the client's 3D preview links.
  const logoKey = (profile as { logo_object_key?: string | null } | null)?.logo_object_key ?? null;
  const logoUrl = logoKey
    ? ((await createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET).createSignedUrl(logoKey, 60 * 15)).data?.signedUrl ?? null)
    : null;

  // The viewer's own name, from their own profile row (the shell does the same).
  let name: string | null = null;
  if (isClient) {
    const p = profile as { business_name?: string | null; legal_name?: string | null } | null;
    name = p?.business_name || p?.legal_name || null;
  } else if (role === "DESIGNER") {
    const { data: d } = await supabase.from("designer_profiles").select("legal_name").eq("user_id", userId).maybeSingle();
    name = (d as { legal_name?: string | null } | null)?.legal_name ?? null;
  } else {
    const { data: st } = await supabase.from("staff_profiles").select("first_name").eq("user_id", userId).maybeSingle();
    name = (st as { first_name?: string | null } | null)?.first_name ?? null;
  }
  const clientCode = (account as { client_code?: string } | null)?.client_code ?? null;

  return (
    <Page form>
      <PageHeader title="Account" />

      <section aria-label="Your identity" className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-[length:var(--fs-4)] font-semibold text-background">
            {initials(name ?? ROLE_WORD[role] ?? "")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[var(--ls-5)]">{name ?? "Your account"}</p>
            {email && <p className="truncate text-[length:var(--fs-3)] text-muted-foreground">{email}</p>}
            <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Roles">
              {roles.map((r) => (
                <li key={r} className="rounded-[var(--r-full)] border border-[color:var(--border-strong)] px-2.5 text-[length:var(--fs-2)] leading-7">
                  {ROLE_WORD[r] ?? r}
                </li>
              ))}
              <li>
                <StatusPill tone={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "attention" : "neutral"}>
                  {status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : "Pending"}
                </StatusPill>
              </li>
            </ul>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          {clientCode && (
            <div>
              <dt className="sr-only">Client code</dt>
              <dd className="text-[length:var(--fs-2)] text-muted-foreground">
                Client code <span className="tabular block font-mono text-[length:var(--fs-3)] text-foreground">{clientCode}</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[length:var(--fs-2)] text-muted-foreground">Account reference</dt>
            <dd>
              <CopyableID value={userId} label="account reference" className="-ml-1.5 text-[length:var(--fs-3)]" />
              <p className="text-[length:var(--fs-2)] text-muted-foreground">Quote it if you contact us.</p>
            </dd>
          </div>
        </dl>
      </section>

      {isClient && (
        <section aria-labelledby="acc-business" className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
          <h2 id="acc-business" className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
            Your business
          </h2>
          <div className="mt-4">
            <ClientProfileForm profile={profile as ClientProfile | null} email={email} next="/account" submitLabel="Save" askHeardAbout={!profile} />
          </div>
        </section>
      )}

      {isClient && (
        <section aria-labelledby="acc-logo" className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
          <h2 id="acc-logo" className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
            Your logo
          </h2>
          <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">On your 3D preview links. PNG or JPEG, up to 2 MB.</p>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
            <img src={logoUrl} alt="Your logo" className="mt-4 h-12 w-auto rounded-[var(--r-sm)] border border-border bg-background p-1" />
          )}
          <form action={uploadLogoAction} className="mt-4 flex flex-wrap items-center gap-3">
            <FilePicker name="logo" label="Logo file" accept="image/png,image/jpeg" required />
            <Button type="submit" size="sm" variant="secondary">
              {logoUrl ? "Replace" : "Upload"}
            </Button>
          </form>
        </section>
      )}

      <section aria-label="Security and payouts" className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        <Link href="/account/security" className="flex min-h-[var(--ctl-lg)] items-center gap-3 px-5 py-3 hover:bg-subtle">
          <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[length:var(--fs-3)] font-medium">Sign-in and security</span>
            <span className="block text-[length:var(--fs-2)] text-muted-foreground">Password, two-step sign-in, devices</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </Link>
        {role === "DESIGNER" && (
          <Link href="/settings/payouts" className="flex min-h-[var(--ctl-lg)] items-center gap-3 px-5 py-3 hover:bg-subtle">
            <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[length:var(--fs-3)] font-medium">Payout details</span>
              <span className="block text-[length:var(--fs-2)] text-muted-foreground">The bank account your earnings go to</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        )}
      </section>

      {/* Settings (Phase 10d): both are per device, so both live here together. */}
      <section aria-labelledby="acc-settings" className="space-y-4 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
        <h2 id="acc-settings" className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
          On this device
        </h2>
        <TimeZoneSetting />
        {pushOffered && (
          <div className="border-t border-border pt-4">
            <PushOptIn publicKey={vapidPublicKey} />
          </div>
        )}
      </section>

      <InstallHint />

      <div className="border-t border-border pt-6">
        <SignOutButton>
          <Button variant="secondary">
            <LogOut /> Sign out
          </Button>
        </SignOutButton>
      </div>
    </Page>
  );
}
