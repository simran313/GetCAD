"use server";

import { revalidatePath } from "next/cache";

import { generateId } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";

// Create a DRAFT order for the current user. The DB function is the source of
// truth (audited); this action just calls it as the logged-in user.
export async function createOrderAction(formData: FormData): Promise<void> {
  const productType = formData.get("product_type")?.toString().trim() || "CAD_MODEL";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("create_order", {
    p_id: generateId(),
    p_product_type: productType,
    p_currency: "USD",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

// Move an order to a new status. The DB rejects anything illegal / out-of-role.
export async function transitionAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const toStatus = formData.get("to_status")?.toString() ?? "";
  // ASSIGNED needs the designer's OPAQUE id (no identity is read here).
  const designerId = formData.get("designer_id")?.toString().trim();
  const payload = designerId ? { designer_id: designerId } : {};

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("transition_order", {
    p_order_id: orderId,
    p_new_status: toStatus,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

/**
 * The independent QC decision. Deliberately NOT transition_order: the DB needs
 * to record WHO reviewed and check they did not produce the work, so the
 * decision has its own function (same pattern as the money and dispute layers).
 */
export async function qcDecisionAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const outcome = formData.get("outcome")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("record_qc_decision", {
    p_order_id: orderId,
    p_outcome: outcome,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

// --- Money layer (escrow). Each just calls the DB function AS THE USER; the DB
// enforces role, state, and money conservation. ---

// SALES (admin) quotes from the category (DECISIONS §4). Price and deadline
// are optional: the database fills the band price, applies the $49 first
// design once per account, and locks designer and QC pay in paise.
export async function quoteAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const category = formData.get("category")?.toString().trim() || null;
  const dollars = formData.get("price_usd")?.toString().trim() ?? "";
  const hours = formData.get("deadline_hours")?.toString().trim() ?? "";

  let priceCents: number | null = null;
  if (dollars) {
    const n = Number(dollars);
    if (!Number.isFinite(n) || n <= 0) throw new Error("price must be a positive amount in dollars");
    priceCents = Math.round(n * 100);
  }
  let deadlineHours: number | null = null;
  if (hours) {
    const n = Number(hours);
    if (!Number.isInteger(n) || n <= 0) throw new Error("deadline must be a whole number of hours");
    deadlineHours = n;
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("quote_order_v2", {
    p_order_id: orderId,
    p_category: category,
    p_price_cents: priceCents,
    p_complex_deadline_hours: deadlineHours,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

// Admin or the order's pod lead: the brief is complete, start the clock once paid (v1.1).
export async function confirmOrderAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("confirm_order", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

// FINANCE (admin) records a Wise / bank / PayPal / manual payment (DECISIONS §13).
export async function markPaidAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_payment_received", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_method: formData.get("method")?.toString() ?? "",
    p_reference: formData.get("reference")?.toString().trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

async function escrowRpc(fn: "release_escrow" | "refund_escrow", orderId: string) {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc(fn, { p_order_id: orderId });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

export async function releaseEscrowAction(formData: FormData): Promise<void> {
  await escrowRpc("release_escrow", formData.get("order_id")?.toString() ?? "");
}
export async function refundEscrowAction(formData: FormData): Promise<void> {
  await escrowRpc("refund_escrow", formData.get("order_id")?.toString() ?? "");
}

// Post a message to an order's double-blind thread. The DB derives the party
// label and checks the caller is the client / assigned designer.
export async function postMessageAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const body = formData.get("body")?.toString() ?? "";
  if (body.trim().length === 0) throw new Error("message is empty");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("post_message", { p_order_id: orderId, p_body: body });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

// --- Disputes. The DB enforces role/state and records the reason/outcome. ---

export async function raiseDisputeAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const reason = formData.get("reason")?.toString() ?? "";
  if (reason.trim().length === 0) throw new Error("a dispute reason is required");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("raise_dispute", { p_order_id: orderId, p_reason: reason });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}

export async function resolveDisputeAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const resolution = formData.get("resolution")?.toString() ?? "";
  const notes = formData.get("notes")?.toString() || null;

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("resolve_dispute", {
    p_order_id: orderId,
    p_resolution: resolution,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orders");
}
