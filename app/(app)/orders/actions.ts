"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateId } from "@/core";
import { issueCertificate } from "@/lib/certificates/issue";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

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
  refuseOn(error);
  revalidatePath("/", "layout");
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
  refuseOn(error);
  revalidatePath("/", "layout");
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
  refuseOn(error);
  // The certificate goes out with the first look (A2). Best effort: the pass
  // stands either way, and the order page offers "Issue certificate" if this
  // did not finish.
  if (outcome === "PASS") {
    try {
      await issueCertificate(supabase, orderId);
    } catch (e) {
      console.error("certificate not issued", orderId, (e as Error).message);
    }
  }
  revalidatePath("/", "layout");
}

// Phase 7a (0050): the designer's model volume, the pod lead's measured
// minimums, a client's waiver, and issuing a certificate by hand.
export async function setVolumeAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("set_job_volume", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_volume_mm3: Number(formData.get("volume_mm3")),
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

const um = (form: FormData, key: string): number | null => {
  const raw = form.get(key)?.toString().trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
};

export async function recordMeasurementsAction(formData: FormData): Promise<void> {
  const seats = formData
    .getAll("seat")
    .map((v) => v.toString().trim())
    .filter(Boolean)
    .map((line) => ({ size_mm: line }));
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("record_qc_measurements", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_min_wall_um: um(formData, "min_wall_mm"),
    p_min_prong_um: um(formData, "min_prong_mm"),
    p_stone_seats: seats,
    p_ring_size: formData.get("ring_size")?.toString() ?? null,
    p_inner_diameter_um: um(formData, "inner_diameter_mm"),
    p_mesh_tolerance_um: um(formData, "mesh_tolerance_mm") ?? 5,
    p_open_edges: Number(formData.get("open_edges") ?? 0) || 0,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

export async function addWaiverAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("add_spec_waiver", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_spec: formData.get("spec")?.toString() ?? "",
    p_requested: formData.get("requested")?.toString() ?? "",
    p_note: formData.get("note")?.toString() || null,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

export async function issueCertificateAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  await issueCertificate(supabase, formData.get("order_id")?.toString() ?? "");
  revalidatePath("/", "layout");
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
    if (!Number.isFinite(n) || n <= 0) throw new Refusal("price must be a positive amount in dollars");
    priceCents = Math.round(n * 100);
  }
  let deadlineHours: number | null = null;
  if (hours) {
    const n = Number(hours);
    if (!Number.isInteger(n) || n <= 0) throw new Refusal("deadline must be a whole number of hours");
    deadlineHours = n;
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("quote_order_v2", {
    p_order_id: orderId,
    p_category: category,
    p_price_cents: priceCents,
    p_complex_deadline_hours: deadlineHours,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// Admin or the order's pod lead: the brief is complete, start the clock once paid (v1.1).
export async function confirmOrderAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("confirm_order", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// FINANCE (admin) records a Wise / bank / PayPal / manual payment (DECISIONS §13).
export async function markPaidAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("mark_payment_received", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_method: formData.get("method")?.toString() ?? "",
    p_reference: formData.get("reference")?.toString().trim() || null,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

async function escrowRpc(fn: "release_escrow" | "refund_escrow", orderId: string) {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc(fn, { p_order_id: orderId });
  refuseOn(error);
  revalidatePath("/", "layout");
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
  if (body.trim().length === 0) throw new Refusal("message is empty");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("post_message", { p_order_id: orderId, p_body: body });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// --- Disputes. The DB enforces role/state and records the reason/outcome. ---

export async function raiseDisputeAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const reason = formData.get("reason")?.toString() ?? "";
  if (reason.trim().length === 0) throw new Refusal("a dispute reason is required");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("raise_dispute", { p_order_id: orderId, p_reason: reason });
  refuseOn(error);
  revalidatePath("/", "layout");
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
  refuseOn(error);
  revalidatePath("/", "layout");
}

// Admin or the order's pod lead assigns a designer from the pod (0041).
// The database checks the pod, the agreement, independence and capacity.
export async function assignDesignerAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("assign_designer", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_designer_id: formData.get("designer_id")?.toString() ?? "",
    p_override_reason: formData.get("override_reason")?.toString().trim() || null,
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// Tick or untick one checklist line (0041). Which column, and whether this
// person may tick it now, is decided by tick_check().
export async function tickCheckAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("tick_check", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_item_id: Number(formData.get("item_id")),
    p_column: formData.get("column")?.toString() ?? "",
    p_ticked: formData.get("ticked") === "true",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// The client sends a preview back (DECISIONS §8). request_revision() checks
// the note, the 2 rounds and the 14-day window, and opens a new version.
export async function requestRevisionAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("request_revision", {
    p_order_id: formData.get("order_id")?.toString() ?? "",
    p_note: formData.get("note")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
}

// A change after approval, or after the included rounds, is a new linked
// order (owner answer Q5), quoted at its own category.
export async function changeOrderAction(formData: FormData): Promise<void> {
  const newId = generateId();
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("create_change_order", {
    p_parent_id: formData.get("order_id")?.toString() ?? "",
    p_new_id: newId,
    p_note: formData.get("note")?.toString() ?? "",
  });
  refuseOn(error);
  revalidatePath("/", "layout");
  redirect(`/orders/${newId}`);
}
