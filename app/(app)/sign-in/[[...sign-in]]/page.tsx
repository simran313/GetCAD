import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { POST_AUTH_PATH } from "@/config/auth-redirects";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  // A signed-in visitor has no business on the sign-in screen. Rendering <SignIn>
  // for them makes Clerk fire an openSignIn() that is a documented no-op ("a user
  // is signed in … single session"), and in keyless/dev it drives a /sign-in ⇄
  // /dashboard bounce. Sending them to the app up front is the standard Clerk
  // pattern and removes both the notice and the loop.
  const { userId } = await auth();
  if (userId) redirect(POST_AUTH_PATH);

  return (
    <main className="flex min-h-[80vh] items-center justify-center py-16">
      {/* Without fallbackRedirectUrl, Clerk returns people to `/` — the marketing
          homepage — which looks exactly like sign-in having failed. See
          config/auth-redirects for why this is fallback rather than force. */}
      <SignIn fallbackRedirectUrl={POST_AUTH_PATH} signUpUrl="/sign-up" />
    </main>
  );
}
