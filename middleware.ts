import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { encodeFirstTouch, FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE, firstTouchFrom, isProtectedPath } from "@/core";

// Clerk runs on every matched request. Protection decisions come from the pure,
// unit-tested isProtectedPath() in core/ — the middleware is just the wiring.
export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedPath(req.nextUrl.pathname)) {
      await auth.protect();
    }
    // First touch (Phase 6): where a visitor first arrived from, kept once
    // in our own cookie and saved with "How did you hear about us?" at
    // sign-up. Never overwritten; no third-party script.
    if (req.method === "GET" && !req.nextUrl.pathname.startsWith("/api") && !req.cookies.has(FIRST_TOUCH_COOKIE)) {
      const res = NextResponse.next();
      res.cookies.set(FIRST_TOUCH_COOKIE, encodeFirstTouch(firstTouchFrom(req.nextUrl, req.headers.get("referer"))), {
        maxAge: FIRST_TOUCH_MAX_AGE,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
      return res;
    }
  },
  {
    // Where auth.protect() sends someone who is not signed in.
    //
    // Without these it is Clerk's hosted Account Portal, on a DIFFERENT ORIGIN.
    // A browser follows that happily; an installed PWA does not — the portal is
    // outside the manifest's scope, and on iOS the app's storage container is
    // separate from Safari's, so the session set over there is not the session
    // read back here. The result is an app that launches straight into a
    // redirect loop and never finishes loading. Both must be set here as well
    // as on ClerkProvider: this one governs the redirect, that one governs the
    // links inside Clerk's own components.
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  },
);

export const config = {
  matcher: [
    // Run on everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and always on API routes.
    "/(api|trpc)(.*)",
  ],
};
