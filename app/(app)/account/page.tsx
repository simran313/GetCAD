import { auth, currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";

import { partyLabel } from "@/components/domain";
import { InstallHint } from "@/components/pwa/install-hint";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
 */
export const dynamic = "force-dynamic";

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

  return (
    <main className="container max-w-2xl py-8">
      <PageHeader
        eyebrow={(account as { client_code?: string } | null)?.client_code ? `Client code ${(account as { client_code: string }).client_code}` : undefined}
        title="Account"
      />

      {isClient && (
        <Card as="section" className="mt-6">
          <CardHeader>
            <CardTitle>Your business</CardTitle>
          </CardHeader>
          <CardBody>
            <ClientProfileForm profile={profile as ClientProfile | null} email={email} next="/account" submitLabel="Save" askHeardAbout={!profile} />
          </CardBody>
        </Card>
      )}

      {isClient && (
        <Card as="section" className="mt-6">
          <CardHeader>
            <CardTitle>Your logo</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-[length:var(--fs-2)]">
            <p className="text-muted-foreground">Shown on the 3D preview links you send your customers. PNG or JPEG, up to 2 MB.</p>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
              <img src={logoUrl} alt="Your logo" className="h-12 w-auto rounded-[var(--r-sm)] border border-border bg-background p-1" />
            )}
            <form action={uploadLogoAction} className="flex flex-wrap items-center gap-2">
              <input type="file" name="logo" accept="image/png,image/jpeg" required aria-label="Logo file" />
              <Button type="submit" size="sm" variant="outline">
                {logoUrl ? "Replace" : "Upload"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <dl className="mt-6 divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        <Row
          label="Signed in as"
          value={[role, ...((grants ?? []) as { role: string }[]).map((g) => g.role).filter((r) => r !== role)].map(partyLabel).join(" · ")}
        />
        <Row label="Status" value={status === "ACTIVE" ? "Active" : "Pending"} />
        <Row
          label="Account reference"
          value={userId}
          mono
          hint="Quote this if you contact us. It identifies your account without naming you."
        />
      </dl>

      <Link href="/account/security" className="mt-4 flex min-h-[var(--ctl)] items-center justify-between rounded-[var(--r-lg)] border border-border bg-card px-[var(--s-5)] shadow-[var(--e-1)] hover:bg-subtle">
        <span>
          <span className="block text-[length:var(--fs-3)] font-medium">Sign-in and security</span>
          <span className="block text-[length:var(--fs-2)] text-muted-foreground">Password, two-step sign-in, devices</span>
        </span>
        <span aria-hidden>→</span>
      </Link>

      <InstallHint />

      {pushOffered ? (
        <div className="mt-4 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
          <PushOptIn publicKey={vapidPublicKey} />
        </div>
      ) : null}

      {role === "DESIGNER" ? (
        <div className="mt-4">
          <Link href="/settings/payouts">
            <Button variant="outline" className="min-h-[var(--ctl)] w-full">
              Payout details
            </Button>
          </Link>
        </div>
      ) : null}

      <div className="mt-8">
        <SignOutButton>
          <Button variant="ghost" className="min-h-[var(--ctl)] w-full">
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[length:var(--fs-2)] uppercase tracking-[var(--ls-1)] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "tabular mt-0.5 break-all font-mono text-[length:var(--fs-3)]"
            : "mt-0.5 text-[length:var(--fs-4)] font-medium"
        }
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
