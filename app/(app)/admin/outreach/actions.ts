"use server";

import { revalidatePath } from "next/cache";

import { IMPORT_CHUNK, type ImportRow } from "@/core/outreach";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * Outreach (0069). Every check — who may do what, which contacts a rep owns,
 * repeats, clients, do-not-contact — is the database's; these pass the
 * caller's own session through and say what it answered.
 */
export type OutreachResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** The database's words, as a sentence. */
const fail = (message: string): { ok: false; error: string } => {
  const m = message.trim();
  return { ok: false, error: `${m.charAt(0).toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? "" : "."}` };
};
const text = (fd: FormData, key: string) => {
  const v = fd.get(key)?.toString().trim();
  return v ? v : null;
};
const refresh = (id?: string) => {
  revalidatePath("/admin/outreach");
  if (id) revalidatePath(`/admin/outreach/${id}`);
};

export interface ImportPartResult {
  import_id: string;
  total: number;
  added: number;
  duplicates: number;
  skipped_clients: number;
  invalid: number;
  errors: { row: number; error: string }[];
}

/** One part of an import (the screen sends a large file in parts of 500). */
export async function importPartAction(input: {
  importId: string | null;
  kind: string;
  fileName: string | null;
  source: string | null;
  senderId: string | null;
  rows: ImportRow[];
}): Promise<OutreachResult<ImportPartResult>> {
  if (input.rows.length > IMPORT_CHUNK) return { ok: false, error: `${IMPORT_CHUNK} rows at most in one part.` };
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("outreach_import", {
    p_import_id: input.importId,
    p_kind: input.kind,
    p_file_name: input.fileName,
    p_source: input.source,
    p_sender_id: input.senderId,
    p_rows: input.rows,
  });
  if (error) return fail(error.message);
  return { ok: true, data: data as ImportPartResult };
}

/** The last part is in: show the new contacts. */
export async function importDoneAction(): Promise<void> {
  refresh();
}

const CONTACT_FIELDS = [
  "business_name", "contact_name", "email", "phone", "whatsapp", "instagram", "linkedin", "website",
  "city", "region", "country", "segment", "tags", "notes", "source",
] as const;

function contactFields(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CONTACT_FIELDS) {
    const v = fd.get(k);
    if (v !== null) out[k] = v.toString();
  }
  return out;
}

export async function addContactAction(fd: FormData): Promise<OutreachResult<string>> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("outreach_add_contact", {
    p_kind: text(fd, "kind") ?? "",
    p_fields: contactFields(fd),
    p_sender_id: text(fd, "sender_id"),
  });
  if (error) return fail(error.message);
  refresh();
  return { ok: true, data: data as string };
}

export async function updateContactAction(fd: FormData): Promise<OutreachResult> {
  const id = text(fd, "id") ?? "";
  const fields: Record<string, string> = contactFields(fd);
  const kind = text(fd, "kind");
  if (kind) fields.kind = kind;
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("outreach_update_contact", { p_id: id, p_fields: fields });
  if (error) return fail(error.message);
  refresh(id);
  return { ok: true };
}

/**
 * SENT, REPLIED or NOTE; the follow-up arrives as an ISO time from the browser.
 * A send may name its template and step (0070): the next date follows the
 * day 1 / 4 / 10 sequence unless a date is given.
 */
export async function logTouchAction(fd: FormData): Promise<OutreachResult> {
  const id = text(fd, "id") ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("outreach_log", {
    p_id: id,
    p_kind: text(fd, "kind") ?? "",
    p_channel: text(fd, "channel"),
    p_body: text(fd, "body"),
    p_follow_up: text(fd, "follow_up"),
    p_sender_id: text(fd, "sender_id"),
    p_template_id: text(fd, "template_id"),
    p_step: text(fd, "step") ? Number(text(fd, "step")) : null,
  });
  if (error) return fail(error.message);
  refresh(id);
  revalidatePath("/admin/outreach/today");
  return { ok: true };
}

export async function setStageAction(fd: FormData): Promise<OutreachResult> {
  const id = text(fd, "id") ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("outreach_set_stage", {
    p_id: id,
    p_stage: text(fd, "stage") ?? "",
    p_follow_up: text(fd, "follow_up"),
  });
  if (error) return fail(error.message);
  refresh(id);
  return { ok: true };
}

export async function setDncAction(fd: FormData): Promise<OutreachResult> {
  const id = text(fd, "id") ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("outreach_set_dnc", {
    p_id: id,
    p_dnc: fd.get("dnc") === "true",
    p_reason: text(fd, "reason") ?? "",
  });
  if (error) return fail(error.message);
  refresh(id);
  return { ok: true };
}

/** Hand one or many contacts to a sender and/or a person (admins). */
export async function assignAction(fd: FormData): Promise<OutreachResult<number>> {
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("outreach_assign", {
    p_ids: ids,
    p_sender_id: text(fd, "sender_id"),
    p_owner_id: text(fd, "owner_id"),
  });
  if (error) return fail(error.message);
  refresh(ids.length === 1 ? ids[0] : undefined);
  return { ok: true, data: data as number };
}

export async function saveSenderAction(fd: FormData): Promise<OutreachResult<string>> {
  const supabase = await createUserSupabaseClient();
  const limit = Number(text(fd, "daily_limit") ?? 20);
  const { data, error } = await supabase.rpc("outreach_save_sender", {
    p_id: text(fd, "id"),
    p_label: text(fd, "label") ?? "",
    p_channel: text(fd, "channel") ?? "EMAIL",
    p_address: text(fd, "address") ?? "",
    p_for_kind: text(fd, "for_kind") ?? "ANY",
    p_signature: text(fd, "signature"),
    p_daily_limit: Number.isFinite(limit) ? Math.round(limit) : 20,
    p_owner_id: text(fd, "owner_id"),
    p_active: fd.get("active") !== "false",
  });
  if (error) return fail(error.message);
  revalidatePath("/admin/outreach/senders");
  refresh();
  return { ok: true, data: data as string };
}

/** Add or change a message template (admins). */
export async function saveTemplateAction(fd: FormData): Promise<OutreachResult<string>> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("outreach_save_template", {
    p_id: text(fd, "id"),
    p_name: text(fd, "name") ?? "",
    p_list: text(fd, "list") ?? "ANY",
    p_segment: text(fd, "segment"),
    p_channel: text(fd, "channel") ?? "EMAIL",
    p_step: Number(text(fd, "step") ?? 1),
    p_subject: text(fd, "subject"),
    p_body: fd.get("body")?.toString() ?? "",
    p_active: fd.get("active") !== "false",
  });
  if (error) return fail(error.message);
  revalidatePath("/admin/outreach/templates");
  return { ok: true, data: data as string };
}
