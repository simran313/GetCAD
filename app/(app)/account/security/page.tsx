import { UserProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CLERK_APPEARANCE } from "@/components/auth-shell";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Password, two-step sign-in and sessions (A7 "Settings"), from Clerk, which
 * holds them. Nothing here touches our database.
 */
export default async function SecurityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <Link href="/account" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Account
      </Link>
      <PageHeader title="Sign-in and security" description="Email, password, two-step sign-in and the devices you are signed in on." />
      <UserProfile routing="hash" appearance={CLERK_APPEARANCE} />
    </main>
  );
}
