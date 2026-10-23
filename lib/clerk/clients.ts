import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/**
 * Open (or find) the sign-in account for a client the team is placing an
 * order for (Phase 4a, owner answer: the team opens the account).
 *
 * Email only, no password: the client signs in later with a code sent to
 * that address. An address that already has an account is reused, never
 * duplicated. Call only after public.i_am_team() has said yes; the database
 * checks again when the account is registered as a client.
 */
export async function openClientAccount(
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
