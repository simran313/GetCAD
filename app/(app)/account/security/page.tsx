import { UserProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CLERK_APPEARANCE } from "@/components/auth-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";

/**
 * Password, two-step sign-in and sessions (A7 "Settings"), from Clerk, which
 * holds them. Nothing here touches our database.
 */
export default async function SecurityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <Page>
      <Link href="/account" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Account
      </Link>
      <PageHeader title="Sign-in and security" description="Email, password, two-step sign-in and the devices you are signed in on." />
      {/* Clerk's card has its own width; held to the page's (8 Nov 2026: 240px too wide at 768px). */}
      <div className="relative max-w-full overflow-x-auto">
        <UserProfile
          routing="hash"
          appearance={{
            ...CLERK_APPEARANCE,
            elements: { ...CLERK_APPEARANCE.elements, rootBox: "w-full max-w-full", cardBox: "w-full max-w-full" },
          }}
        />
      </div>
    </Page>
  );
}
