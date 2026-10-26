import { AuthProvider } from "@/components/auth/auth-provider";

/** Sign-in and sign-up run Clerk's own screens, so they load Clerk. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
