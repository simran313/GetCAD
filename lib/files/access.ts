import "server-only";

import { fileGrantFor, type FileKind } from "@/core";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * May the signed-in caller have this file version? The one check every file
 * door uses (/api/files/[versionId] and its stream): RLS decides whether the
 * row is visible at all; fileGrantFor decides entitlement, which the escrow
 * rests on. Returns the storage key, or null — callers answer 404 either way.
 */
export async function grantedObjectKey(versionId: string): Promise<{ objectKey: string } | null> {
  const supabase = await createUserSupabaseClient();
  const { data: version, error } = await supabase
    .from("file_versions")
    .select("object_key, order_id, kind, uploader_party")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !version) return null;

  // visible_orders() returns null for an order the caller cannot see. It also
  // says how the caller relates to the order, which is all the gate needs: no
  // user id is compared here, because none is readable any more (0036).
  const [orderRes, meRes] = await Promise.all([
    supabase
      .rpc("visible_orders", { p_order_id: version.order_id as string })
      .select("status, relation")
      .maybeSingle(),
    supabase.from("users").select("role").maybeSingle(),
  ]);
  if (orderRes.error || !orderRes.data || meRes.error || !meRes.data) return null;

  const order = orderRes.data as { status: string; relation: string };
  const me = meRes.data as { role: string };
  const isOrderClient = order.relation === "CLIENT";
  const isOrderDesigner = order.relation === "DESIGNER";

  const grant = fileGrantFor({
    orderStatus: order.status,
    role: me.role,
    isOrderClient,
    isOrderDesigner,
    isUploader:
      (version.uploader_party === "CLIENT" && isOrderClient) ||
      (version.uploader_party === "DESIGNER" && isOrderDesigner),
    fileKind: version.kind as FileKind,
  });
  return grant === "ALLOW" ? { objectKey: version.object_key as string } : null;
}
