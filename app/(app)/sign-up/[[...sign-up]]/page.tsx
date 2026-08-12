import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { POST_AUTH_PATH } from "@/config/auth-redirects";

export const metadata = { title: "Create an account" };

export default async function SignUpPage() {
  // Same guard as /sign-in: an already-authenticated session should never be
  // shown the account-creation UI, which otherwise no-ops openSignUp() and, in
  // keyless/dev, loops against the protected dashboard.
  const { userId } = await auth();
  if (userId) redirect(POST_AUTH_PATH);

  return (
    <main className="flex min-h-[80vh] items-center justify-center py-16">
      <SignUp fallbackRedirectUrl={POST_AUTH_PATH} signInUrl="/sign-in" />
    </main>
  );
}
