import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AuthShell, CLERK_APPEARANCE } from "@/components/auth-shell";
import { POST_AUTH_PATH } from "@/config/auth-redirects";

export const metadata = { title: "Create an account" };

export default async function SignUpPage() {
  // Same guard as /sign-in: an already-authenticated session should never be
  // shown the account-creation UI, which otherwise no-ops openSignUp() and, in
  // keyless/dev, loops against the protected dashboard.
  const { userId } = await auth();
  if (userId) redirect(POST_AUTH_PATH);

  return (
    <AuthShell title="Open your studio account">
      <SignUp fallbackRedirectUrl={POST_AUTH_PATH} signInUrl="/sign-in" appearance={CLERK_APPEARANCE} />
    </AuthShell>
  );
}
