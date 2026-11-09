import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { encodeFirstTouch, FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE, firstTouchFrom, isProtectedPath, isPublicWebsitePage } from "@/core";

/**
 * First touch (Phase 6): where a visitor first arrived from, kept once in our
 * own cookie and saved with "How did you hear about us?" at sign-up. Never
 * overwritten; no third-party script. Null when there is nothing to set.
 */
function firstTouch(req: NextRequest): NextResponse | null {
  if (req.method !== "GET" || req.nextUrl.pathname.startsWith("/api") || req.cookies.has(FIRST_TOUCH_COOKIE)) return null;
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

// Clerk runs on every matched request but a page view of the public website.
// Protection decisions come from the pure, unit-tested isProtectedPath() in
// core/ — the middleware is just the wiring.
const withClerk = clerkMiddleware(
  async (auth, req) => {
    if (isProtectedPath(req.nextUrl.pathname)) {
      await auth.protect();
    }
    const res = firstTouch(req);
    if (res) return res;
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

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // The public website's page views skip Clerk (8 Nov 2026): with a Clerk
  // development instance, Clerk sent every first-time browser, search
  // engines' renderers included, through a redirect to clerk.accounts.dev
  // and back before the page. Nothing on these pages reads the session on
  // the server; their form posts (POST) still go through Clerk below.
  if ((req.method === "GET" || req.method === "HEAD") && isPublicWebsitePage(req.nextUrl.pathname)) {
    return firstTouch(req) ?? NextResponse.next();
  }
  return withClerk(req, ev);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and always on API routes.
    "/(api|trpc)(.*)",
  ],
};
