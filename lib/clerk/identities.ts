import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/**
 * Who an account belongs to, from Clerk — for the admin Access screen only.
 *
 * The database holds no email for most accounts; Clerk does. This module is
 * the one place the app asks Clerk for one, and it must only be called AFTER
 * public.record_identity_lookup() has succeeded for the same ids: that is the
 * admin check and the audit entry (0038). Calling it without that skips both.
 */

export interface Identity {
  email: string | null;
  name: string | null;
}

/** Clerk caps userId filters per request; stay well under it. */
const BATCH = 100;

export async function identitiesFor(userIds: string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  // Only real Clerk ids: old test rows without the user_ prefix would make
  // Clerk reject the whole request.
  const ids = [...new Set(userIds)].filter((id) => id.startsWith("user_"));
  if (ids.length === 0) return out;

  const clerk = await clerkClient();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data } = await clerk.users.getUserList({ userId: ids.slice(i, i + BATCH), limit: BATCH });
    for (const u of data) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      out.set(u.id, {
        email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null,
        name: name || null,
      });
    }
  }
  return out;
}

/** Account ids whose email or name matches a free-text search (admin search box). */
export async function searchIdentities(query: string): Promise<string[]> {
  const clerk = await clerkClient();
  const { data } = await clerk.users.getUserList({ query, limit: BATCH });
  return data.map((u) => u.id);
}
