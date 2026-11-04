import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/**
 * Open (or find) a sign-in account by email, for someone the team adds:
 * a client it orders for (Phase 4a) or a designer it brings on (owner,
 * 4 Nov 2026).
 *
 * Email only, no password: the person signs in later with a code sent to
 * that address. An address that already has an account is reused, never
 * duplicated. Call only after the database has said the caller may; it
 * checks again when the account is registered.
 */
export async function openSignInAccount(
  email: string,
  name: string | null,
): Promise<{ userId: string; existed: boolean }> {
  const clerk = await clerkClient();
  const found = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
  const existing = found.data[0];
  if (existing) return { userId: existing.id, existed: true };

  const [firstName, ...rest] = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const user = await clerk.users.createUser({
    emailAddress: [email],
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
    skipPasswordRequirement: true,
  });
  return { userId: user.id, existed: false };
}
