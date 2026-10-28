"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Signing out ends with a full page load of the website (Phase 12), not an
 * in-app move. The portal keeps pages it has just shown in memory for a few
 * seconds (next.config staleTimes); a full load drops all of them, so the
 * next person to sign in on this device can never be shown the last one's
 * pages.
 */
export function useSignOut() {
  const { signOut } = useClerk();
  return () => signOut(() => window.location.assign("/"));
}

export function SignOutButton() {
  const signOut = useSignOut();
  return (
    <Button type="button" variant="secondary" onClick={() => void signOut()}>
      <LogOut /> Sign out
    </Button>
  );
}
