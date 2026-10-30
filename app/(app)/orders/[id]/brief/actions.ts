"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateId } from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

/**
 * Start a new order and go straight to its brief.
 *
 * The order row has to exist before the spec can reference it, so "New order"
 * creates a DRAFT immediately rather than holding a half-filled brief in
 * browser memory until the end. That is also what makes the wizard resumable:
 * a real order id means a real URL, so closing the tab on step 4 of a long form
 * loses nothing.
 */
export async function startBriefAction(formData?: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  // CAD or renders (N0 → N1 / N7). Anything else is CAD.
  const service = formData?.get("service")?.toString() === "render" ? "render" : "cad";

  // orders.client_id has a foreign key to users.id, and a person who signed up
  // and pressed "New order" before visiting any screen that calls this has no
  // row yet. The failure is a raw foreign-key violation on their very first
  // action in the product. Every other authenticated screen already does this;
  // this path was the one that did not.
  const ensured = await supabase.rpc("ensure_self");
  refuseOn(ensured.error);

  // An untouched draft of the same kind is reused rather than adding another
  // empty one to the list each time "New order" is pressed.
  const reuse = await emptyDraft(supabase, service);
  if (reuse) redirect(`/orders/${reuse}/brief`);

  const id = await newDraft(supabase, service);
  // The funnel (Phase 6, 0049). Best effort: a lost event never blocks an order.
  await supabase.rpc("record_marketing_event", { p_event: "brief_started", p_order_id: id, p_props: { service } });
  redirect(`/orders/${id}/brief`);
}

type Supabase = Awaited<ReturnType<typeof createUserSupabaseClient>>;

async function newDraft(supabase: Supabase, service: "cad" | "render"): Promise<string> {
  const id = generateId();
  const { error } = await supabase.rpc("create_order", { p_id: id, p_product_type: "CAD_MODEL", p_currency: "USD" });
  refuseOn(error);
  if (service === "render") {
    const { error: serviceError } = await supabase.rpc("set_order_service", { p_order_id: id, p_service: "render" });
    refuseOn(serviceError);
  }
  return id;
}

/** The caller's newest draft of this service with no brief and no pictures. */
async function emptyDraft(supabase: Supabase, service: "cad" | "render"): Promise<string | null> {
  const { data } = await supabase
    .rpc("visible_orders")
    .select("id, status, service, relation, created_at")
    .eq("status", "DRAFT")
    .eq("relation", "CLIENT")
    .order("created_at", { ascending: false });
  const drafts = ((data ?? []) as { id: string; service: string | null }[]).filter((d) => (d.service ?? "cad") === service);
  if (drafts.length === 0) return null;
  const ids = drafts.map((d) => d.id);
  const [specs, images] = await Promise.all([
    supabase.from("order_specs").select("order_id").in("order_id", ids),
    supabase.from("order_reference_images").select("order_id").in("order_id", ids),
  ]);
  const used = new Set([...(specs.data ?? []), ...(images.data ?? [])].map((r) => (r as { order_id: string }).order_id));
  return drafts.find((d) => !used.has(d.id))?.id ?? null;
}

/**
 * Start from a past order: a new draft with the same brief, accent stones,
 * pictures and the marks on them, opened on Review so a repeat order is one
 * check and one tap. Built from the same functions the wizard uses, as the
 * client (ownership and RLS apply); pictures are copied under the new order
 * (they were cleaned when first uploaded). Not create_change_order: that is a
 * change to an approved design, linked to it and sent at once.
 */
export async function duplicateBriefAction(formData: FormData): Promise<void> {
  const fromId = formData.get("from_order_id")?.toString() ?? "";
  const supabase = await createUserSupabaseClient();

  const { data: from } = await supabase
    .rpc("visible_orders", { p_order_id: fromId })
    .select("id, relation, service")
    .maybeSingle();
  const source = from as { id: string; relation: string; service: string | null } | null;
  if (!source || source.relation !== "CLIENT") throw new Refusal("order not found");

  const [specRes, accentsRes, imagesRes] = await Promise.all([
    supabase.from("order_specs").select("*").eq("order_id", fromId).maybeSingle(),
    supabase.from("order_spec_accents").select("shape, width_um, quantity, setting").eq("order_id", fromId).order("position"),
    supabase
      .from("order_reference_images")
      .select("id, object_key, content_type, size_bytes, is_primary, position, order_reference_pins(x_bp, y_bp, label, position)")
      .eq("order_id", fromId)
      .order("position"),
  ]);
  const spec = specRes.data as Record<string, string | number | boolean | null> | null;
  if (!spec) throw new Refusal("that order has no brief to copy");

  const service = source.service === "render" ? "render" : "cad";
  const id = await newDraft(supabase, service);

  const v = (k: string) => spec[k] ?? null;
  const { error } = await supabase.rpc("upsert_order_spec", {
    p_order_id: id,
    p_reference_name: v("reference_name") ?? "",
    p_product: v("product"),
    p_metal: v("metal"),
    p_karatage: v("karatage") ?? "",
    p_purpose: v("purpose") ?? "CASTING",
    p_format: v("format") ?? "BOTH",
    p_finish: v("finish") ?? "HIGH_POLISH",
    p_has_centre_stone: !!spec.has_centre_stone,
    p_centre_shape: v("centre_shape"),
    p_centre_length_um: v("centre_length_um"),
    p_centre_width_um: v("centre_width_um"),
    p_centre_depth_um: v("centre_depth_um"),
    p_centre_carat_mct: v("centre_carat_mct"),
    p_centre_certified: !!spec.centre_certified,
    p_centre_quantity: v("centre_quantity") ?? 0,
    p_centre_setting: v("centre_setting"),
    p_stones_supplied_by: v("stones_supplied_by") ?? "NONE",
    p_component_count: v("component_count") ?? 1,
    p_render_views: v("render_views") ?? 0,
    p_priority: "STANDARD",
    p_based_on_order_id: null,
    p_change_summary: null,
    p_notes: v("notes"),
    p_ring_size: v("ring_size"),
    p_inner_circumference_um: v("inner_circumference_um"),
    p_inner_diameter_um: v("inner_diameter_um"),
    p_length_um: v("length_um"),
  });
  refuseOn(error);

  const accents = (accentsRes.data ?? []) as { shape: string; width_um: number; quantity: number; setting: string }[];
  if (accents.length > 0) {
    const { error: accentError } = await supabase.rpc("set_order_accents", {
      p_order_id: id,
      p_shapes: accents.map((a) => a.shape),
      p_widths_um: accents.map((a) => a.width_um),
      p_quantities: accents.map((a) => a.quantity),
      p_settings: accents.map((a) => a.setting),
    });
    refuseOn(accentError);
  }

  // The rows above were read under RLS; the service role only moves those bytes.
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  type Img = {
    object_key: string;
    content_type: string;
    size_bytes: number;
    is_primary: boolean;
    order_reference_pins: { x_bp: number; y_bp: number; label: string; position: number }[] | null;
  };
  for (const img of (imagesRes.data ?? []) as Img[]) {
    const { data: signed } = await storage.createSignedUrl(img.object_key, 60);
    if (!signed?.signedUrl) continue;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = img.object_key.split(".").pop() ?? "jpg";
    const key = `${id}/refs/${generateId()}.${ext}`;
    const up = await storage.upload(key, bytes, { contentType: img.content_type, upsert: false });
    if (up.error) continue;
    const { data: imageId, error: imageError } = await supabase.rpc("add_reference_image", {
      p_order_id: id,
      p_object_key: key,
      p_content_type: img.content_type,
      p_size_bytes: img.size_bytes,
    });
    if (imageError || !imageId) {
      await storage.remove([key]);
      continue;
    }
    const pins = (img.order_reference_pins ?? []).slice().sort((a, b) => a.position - b.position);
    if (pins.length > 0) {
      await supabase.rpc("set_reference_pins", {
        p_image_id: imageId,
        p_xs: pins.map((p) => p.x_bp),
        p_ys: pins.map((p) => p.y_bp),
        p_labels: pins.map((p) => p.label),
      });
    }
    if (img.is_primary) await supabase.rpc("set_primary_reference", { p_image_id: imageId });
  }

  await supabase.rpc("record_marketing_event", { p_event: "brief_started", p_order_id: id, p_props: { service, from: "past_order" } });
  redirect(`/orders/${id}/brief/review`);
}

/** Numeric form fields arrive as strings or empty; empty means "not answered". */
function num(form: FormData, key: string): number | null {
  const raw = form.get(key)?.toString().trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function str(form: FormData, key: string): string | null {
  return form.get(key)?.toString().trim() || null;
}

/**
 * Save the brief.
 *
 * Everything meaningful is checked in the database — ownership, the quote
 * freeze, and whether the answers contradict each other. This does no
 * validation of its own beyond turning form strings into the right types,
 * deliberately: a second set of rules here is a second set to keep in step.
 */
export async function saveBriefAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const hasCentre = formData.get("has_centre_stone") === "on";

  const supabase = await createUserSupabaseClient();

  const { error } = await supabase.rpc("upsert_order_spec", {
    p_order_id: orderId,
    p_reference_name: str(formData, "reference_name") ?? "",
    p_product: str(formData, "product") ?? "RING",
    p_metal: str(formData, "metal") ?? "YELLOW",
    p_karatage: str(formData, "karatage") ?? "",
    p_purpose: str(formData, "purpose") ?? "CASTING",
    p_format: str(formData, "format") ?? "BOTH",
    p_finish: str(formData, "finish") ?? "HIGH_POLISH",
    p_has_centre_stone: hasCentre,
    // Cleared wholesale when there is no centre stone. Sending stale
    // dimensions would be refused by order_specs_centre_coherent anyway, but
    // the point is not to rely on being caught.
    p_centre_shape: hasCentre ? str(formData, "centre_shape") : null,
    p_centre_length_um: hasCentre ? num(formData, "centre_length_um") : null,
    p_centre_width_um: hasCentre ? num(formData, "centre_width_um") : null,
    p_centre_depth_um: hasCentre ? num(formData, "centre_depth_um") : null,
    p_centre_carat_mct: hasCentre ? num(formData, "centre_carat_mct") : null,
    p_centre_certified: hasCentre && formData.get("centre_certified") === "on",
    p_centre_quantity: hasCentre ? (num(formData, "centre_quantity") ?? 1) : 0,
    p_centre_setting: hasCentre ? str(formData, "centre_setting") : null,
    p_stones_supplied_by: str(formData, "stones_supplied_by") ?? "NONE",
    p_component_count: num(formData, "component_count") ?? 1,
    p_render_views: num(formData, "render_views") ?? 0,
    p_priority: str(formData, "priority") ?? "STANDARD",
    p_based_on_order_id: str(formData, "based_on_order_id"),
    p_change_summary: str(formData, "change_summary"),
    p_notes: str(formData, "notes"),
    // The size the piece is made to (DECISIONS §11 minimum), in µm.
    p_ring_size: str(formData, "ring_size"),
    p_inner_circumference_um: num(formData, "inner_circumference_um"),
    p_inner_diameter_um: num(formData, "inner_diameter_um"),
    p_length_um: num(formData, "length_um"),
  });
  refuseOn(error);

  // Accent rows travel as four parallel arrays, which the database refuses if
  // they disagree in length.
  const shapes = formData.getAll("accent_shape").map(String).filter(Boolean);
  if (shapes.length > 0) {
    const widths = formData.getAll("accent_width_um").map((v) => Math.round(Number(v) || 0));
    const quantities = formData.getAll("accent_quantity").map((v) => Math.round(Number(v) || 0));
    const settings = formData.getAll("accent_setting").map(String);
    const { error: accentError } = await supabase.rpc("set_order_accents", {
      p_order_id: orderId,
      p_shapes: shapes,
      p_widths_um: widths,
      p_quantities: quantities,
      p_settings: settings,
    });
    refuseOn(accentError);
  } else {
    const { error: clearError } = await supabase.rpc("set_order_accents", {
      p_order_id: orderId,
      p_shapes: [],
      p_widths_um: [],
      p_quantities: [],
      p_settings: [],
    });
    refuseOn(clearError);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/brief`);
  // "Review and send" (N5) checks the minimum and sends from there.
  if (formData.get("intent") === "review") redirect(`/orders/${orderId}/brief/review`);
}

/**
 * Send the brief for a price (N5). submit_brief() refuses until the
 * DECISIONS §11 minimum is there and names what is missing.
 */
export async function sendBriefAction(formData: FormData): Promise<void> {
  const orderId = formData.get("order_id")?.toString() ?? "";
  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("submit_brief", { p_order_id: orderId });
  refuseOn(error);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}/sent`);
}
