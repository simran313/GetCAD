"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

/**
 * Live chat (Phase 13): hear the database's "this thread changed" signals
 * (db/migrations/0052) on each thread's private Realtime channel, joined
 * with the person's own Clerk session token, so the database decides who may
 * listen exactly as it decides who may read the thread. A signal carries
 * nothing; on one, the page reads itself again through the usual functions.
 *
 * Off unless NEXT_PUBLIC_CHAT_REALTIME is "1" (the migration must be applied
 * first). Returns whether every channel is joined; while it is not, the
 * caller keeps checking for news on its own.
 */
export const CHAT_REALTIME = process.env.NEXT_PUBLIC_CHAT_REALTIME === "1";

let shared: SupabaseClient | null = null;
let tokenSource: () => Promise<string | null> = async () => null;

function browserClient(): SupabaseClient {
  // Read literally: only `process.env.NEXT_PUBLIC_*` is inlined into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  shared ??= createClient(url, anonKey, {
    accessToken: () => tokenSource(),
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return shared;
}

export function useThreadSignals(threadIds: string[] | undefined, onSignal: () => void): boolean {
  const { getToken, isSignedIn } = useAuth();
  const [joined, setJoined] = useState(false);
  const latest = useRef(onSignal);
  latest.current = onSignal;
  const key = (threadIds ?? []).join(",");

  useEffect(() => {
    if (!CHAT_REALTIME || !isSignedIn || !key) return;
    tokenSource = () => getToken();
    const supabase = browserClient();
    const ids = key.split(",");
    const subscribed = new Set<string>();
    let wasJoined = false;
    let timer: number | undefined;
    // Several signals in a burst (a message with a file) mean one read.
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current(), 120);
    };

    let stopped = false;
    let channels: ReturnType<SupabaseClient["channel"]>[] = [];
    // A private channel is checked when it is joined: set the token first.
    const join = () =>
      ids.map((id) =>
        supabase
          .channel(`thread:${id}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, fire)
          .subscribe((status) => {
            if (stopped) return;
            if (status === "SUBSCRIBED") subscribed.add(id);
            else subscribed.delete(id);
            const now = subscribed.size === ids.length;
            // Joined, or back after a drop: anything sent meanwhile was missed, so read once.
            if (now && !wasJoined) fire();
            wasJoined = now;
            setJoined(now);
          }),
      );
    void supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!stopped) channels = join();
      });
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      setJoined(false);
      for (const c of channels) void supabase.removeChannel(c);
    };
  }, [key, isSignedIn, getToken]);

  return joined;
}
