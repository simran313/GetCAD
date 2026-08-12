import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseConfig } from "@/config/supabase";

/**
 * A browser Supabase client used ONLY for Realtime liveness.
 *
 * It is bound to the current user's Clerk session token via the async
 * `accessToken` hook — the same bridge the server client uses — so the realtime
 * socket authenticates as the caller and RLS applies to `postgres_changes`.
 * A subscriber therefore receives a row event only if their order-scoped SELECT
 * policy would let them read the row, which keeps the double-blind boundary
 * exactly where migration 0013 put it.
 *
 * This client is never used to READ data for display: events are only a signal
 * to re-fetch from the server, where the authoritative RLS-scoped queries live.
 */
export function createRealtimeClient(
  getToken: () => Promise<string | null>,
): SupabaseClient {
  const { url, anonKey } = readSupabaseConfig();
  return createClient(url, anonKey, {
    accessToken: async () => (await getToken()) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
