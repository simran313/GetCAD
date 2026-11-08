import type { Metadata } from "next";

import { AuthProvider } from "@/components/auth/auth-provider";

// Sign-in and sign-up are not search results (8 Nov 2026); robots.ts lets
// Google read this, so it drops them instead of listing a bare link.
export const metadata: Metadata = { robots: { index: false, follow: true } };

/** Sign-in and sign-up run Clerk's own screens, so they load Clerk. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
