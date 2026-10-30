"use server";

import { redirect } from "next/navigation";

import { generateId, sanitizeUpload } from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { openClientAccount } from "@/lib/clerk/clients";
import { flushEmailsBestEffort } from "@/lib/email/dispatch";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal, refuseOn } from "@/lib/refusal";

const SOURCES = new Set(["email", "whatsapp", "phone"]);
const PRODUCTS = new Set(["RING", "BAND", "PENDANT", "EARRING", "BRACELET", "BANGLE", "NECKLACE", "BROOCH", "OTHER"]);
const SERVICES = new Set(["cad", "render", "cad_render"]);

const text = (f: FormData, k: string) => f.get(k)?.toString().trim() || null;

/**
 * The team places an order for a client from an email, a WhatsApp chat or a
 * call (Phase 4a). Every rule is in the database functions it calls as the
 * user: who may, which pod, at least one screenshot, the email to the client.
 * This action only opens the sign-in account for a new client (Clerk), and
 * cleans the screenshots through the same gate as every upload.
 */
export async function newOrderForClientAction(formData: FormData): Promise<void> {
  const supabase = await createUserSupabaseClient();
  const { data: isTeam } = await supabase.rpc("i_am_team");
  if (isTeam !== true) throw new Refusal("only an admin or a pod lead may place an order for a client");

  const source = text(formData, "source") ?? "";
  const product = text(formData, "product") ?? "";
  const service = text(formData, "service") ?? "cad";
  if (!SOURCES.has(source)) throw new Refusal("say where the order came from: email, WhatsApp or phone");
  if (!PRODUCTS.has(product)) throw new Refusal("pick the product");
  if (!SERVICES.has(service)) throw new Refusal("pick the service");

  const files = formData.getAll("screenshots").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Refusal("add at least one screenshot of the request");
  if (files.length > 20) throw new Refusal("at most 20 screenshots per order");

  // Every screenshot is cleaned (EXIF and text chunks removed) before
  // anything is created, so a refused file leaves no half-made order behind.
  const cleaned = [];
  for (const file of files) {
    const gate = sanitizeUpload(
      {
        filename: file.name,
        declaredMimeType: file.type,
        sizeBytes: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
      generateId(),
      { requireMetadataStrip: true },
    );
    if (!gate.ok || !gate.file.contentType.startsWith("image/")) {
      throw new Refusal(`screenshot "${file.name}" refused: ${gate.ok ? "not an image" : gate.reason}. Use PNG or JPEG.`);
    }
    cleaned.push(gate.file);
  }

  // The client: picked from the search, or opened now.
  let clientId = text(formData, "client_id");
  if (!clientId) {
    const email = text(formData, "new_email")?.toLowerCase() ?? null;
    const business = text(formData, "new_business");
    if (!email || !business) throw new Refusal("pick a client, or give the new client's business name and email");
    const contact = text(formData, "new_contact");
    const account = await openClientAccount(email, contact);
    const { error } = await supabase.rpc("register_client", {
      p_user_id: account.userId,
      p_business_name: business,
      p_contact_name: contact,
      p_email: email,
      p_phone: text(formData, "new_phone"),
    });
    refuseOn(error);
    clientId = account.userId;
  }

  const receivedRaw = text(formData, "received_at");
  const received = receivedRaw ? new Date(receivedRaw) : null;
  const orderId = generateId();
  const { error: createError } = await supabase.rpc("create_order_on_behalf", {
    p_id: orderId,
    p_client_id: clientId,
    p_source: source,
    p_product: product,
    p_service: service,
    p_received_at: received && !Number.isNaN(received.getTime()) ? received.toISOString() : null,
    p_note: text(formData, "note"),
    p_pod_id: text(formData, "pod_id"),
  });
  refuseOn(createError);

  // Stored under opaque names, recorded as the user.
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  for (const shot of cleaned) {
    const objectKey = `${orderId}/shots/${shot.objectName}`;
    const up = await storage.upload(objectKey, shot.bytes, { contentType: shot.contentType, upsert: false });
    if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);
    const { error } = await supabase.rpc("add_order_screenshot", {
      p_order_id: orderId,
      p_object_key: objectKey,
      p_content_type: shot.contentType,
      p_size_bytes: shot.sizeBytes,
    });
    if (error) {
      await storage.remove([objectKey]);
      refuseOn(error);
    }
  }

  const { error: submitError } = await supabase.rpc("submit_order_on_behalf", {
    p_order_id: orderId,
    p_notify: formData.get("notify") === "on",
  });
  refuseOn(submitError);

  await flushEmailsBestEffort();
  redirect(`/orders/${orderId}`);
}
