import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InstallHint } from "@/components/pwa/install-hint";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pushIsConfiguredForBrowser } from "@/config/push";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { ClientProfileForm, type ClientProfile } from "../account/ClientProfileForm";

/**
 * S3 — Welcome (docs/design). First, who the client is (it names their client
 * code); then notifications and installing the app. Home sends a client here
 * until their business is on file.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const { data: me } = await supabase.from("users").select("role").maybeSingle();
  if (me?.role && me.role !== "CLIENT") redirect("/home");

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("business_name, legal_name, email, phone")
    .maybeSingle();
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="container max-w-3xl space-y-6 py-8">
      <PageHeader
        eyebrow="The CAD Pillar"
        title={profile ? `Welcome, ${(profile as ClientProfile).business_name ?? (profile as ClientProfile).legal_name}` : "Welcome"}
        description={
          profile
            ? "Two things that make the next order easier."
            : "Tell us who you are. It takes a minute, and you can brief straight away."
        }
      />

      {!profile ? (
        <Card>
          <CardHeader>
            <CardTitle>Your business</CardTitle>
          </CardHeader>
          <CardBody>
            <ClientProfileForm profile={null} email={email} next="/welcome" submitLabel="Continue" askHeardAbout />
          </CardBody>
        </Card>
      ) : (
        <>
          {pushIsConfiguredForBrowser(vapid) && (
            <Card>
              <CardHeader>
                <CardTitle>Know the moment it&apos;s ready</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="mb-3 text-[length:var(--fs-3)] text-muted-foreground">Prices, renders, files, messages and payments.</p>
                <PushOptIn publicKey={vapid} />
              </CardBody>
            </Card>
          )}
          <InstallHint />
          <div className="flex flex-wrap gap-2">
            <Link href="/orders/new" className={buttonVariants()}>
              Start your first order
            </Link>
            <Link href="/home" className={buttonVariants({ variant: "outline" })}>
              Go to home
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
