import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Why the designer is on a new version (D2, D4): the client's revision note
 * for this version, or the pod lead's send-back note (record_qc_decision
 * posts it to the designer thread as "Sent back by QC: …"). Lines are split
 * so a numbered list in the note reads as a list. Since 0059 a send-back
 * starts with the failed QC lines ("Failed checks:", then "- line — finding
 * — remark"); each becomes one item.
 */
export interface VersionNote {
  from: "client" | "qc";
  lines: string[];
}

const QC_PREFIX = "Sent back by QC: ";

export function noteLines(note: string): string[] {
  return note
    .split(/\r?\n|(?:^|\s)\d+[.)]\s+/)
    .map((l) => l.trim().replace(/^-\s+/, ""))
    .filter((l) => l && l !== "Failed checks:");
}

export async function versionNote(supabase: SupabaseClient, orderId: string, workVersion: number): Promise<VersionNote | null> {
  if (workVersion <= 1) return null;
  const [revs, msgs] = await Promise.all([
    supabase.rpc("order_revisions", { p_order_id: orderId }),
    supabase.rpc("order_messages", { p_order_id: orderId }),
  ]);
  const client = ((revs.data ?? []) as { note: string; work_version: number }[]).find((r) => r.work_version === workVersion);
  if (client) return { from: "client", lines: noteLines(client.note) };
  const qc = ((msgs.data ?? []) as { thread_kind: string; body: string }[])
    .filter((m) => m.thread_kind === "internal" && m.body.startsWith(QC_PREFIX))
    .at(-1);
  return qc ? { from: "qc", lines: noteLines(qc.body.slice(QC_PREFIX.length)) } : null;
}
