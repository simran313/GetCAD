import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { Pin } from "@/core";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { ErrorPanel } from "@/components/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { briefRows } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { BriefWizard, type AccentRow } from "./BriefWizard";
import { ReferenceSection, type ReferenceImage } from "./ReferenceSection";
import { Page } from "@/components/ui/page";

/** Long enough to fill in a brief on a phone, short enough not to be a link. */
const REFERENCE_URL_TTL_SECONDS = 60 * 60;

/**
 * The brief for one order, at its own resumable URL.
 *
 * Its own route rather than a modal over the order: this is a long form on a
 * phone, and a person who closes the tab on step four should be able to come
 * back to it from their history rather than start again.
 */
export const dynamic = "force-dynamic";

interface SpecRow {
  /** Absent for a designer: job_brief() leaves it out (0036). */
  reference_name?: string;
  product: string;
  metal: string;
  // Optional since 0035 (owner answer Q6).
  karatage: string | null;
  purpose: string | null;
  format: string | null;
  finish: string | null;
  has_centre_stone: boolean;
  centre_shape: string | null;
  centre_setting: string | null;
  centre_quantity: number;
  centre_length_um: number | null;
  centre_width_um: number | null;
  centre_depth_um: number | null;
  centre_carat_mct: number | null;
  centre_certified: boolean;
  ring_size?: string | null;
  inner_circumference_um?: number | null;
  inner_diameter_um?: number | null;
  length_um?: number | null;
  render_views?: number | null;
  notes?: string | null;
}

interface ImageRow {
  id: string;
  object_key: string;
  is_primary: boolean;
  position: number;
  order_reference_pins: Array<{ x_bp: number; y_bp: number; label: string; position: number }> | null;
}

interface AccentDbRow {
  position: number;
  shape: string;
  width_um: number;
  quantity: number;
  setting: string;
}

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const supabase = await createUserSupabaseClient();

  // A designer cannot read order_specs (it holds the client's own label and
  // the link to their earlier orders); job_brief() is their copy without
  // either. Everyone else reads the row, under RLS.
  const { data: rel } = await supabase.rpc("my_order_relation", { p_order_id: id });
  const isDesigner = rel === "DESIGNER";

  const [orderRes, specRes, accentsRes, imagesRes] = await Promise.all([
    supabase.rpc("visible_orders", { p_order_id: id }).select("id, status, relation, source, service, display_ref").maybeSingle(),
    isDesigner
      ? supabase.rpc("job_brief", { p_order_id: id })
      : supabase.from("order_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase
      .from("order_spec_accents")
      .select("position, shape, width_um, quantity, setting")
      .eq("order_id", id)
      .order("position"),
    supabase
      .from("order_reference_images")
      .select("id, object_key, is_primary, position, order_reference_pins(x_bp, y_bp, label, position)")
      .eq("order_id", id)
      .order("position"),
  ]);

  if (orderRes.error) {
    return (
      <Page form>
        <ErrorPanel title="Couldn't load this order" message={orderRes.error.message} />
      </Page>
    );
  }

  const order = orderRes.data;
  if (!order) {
    return (
      <Page form>
        <BackLink id={id} />
        <div className="mt-6 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-10)] text-center">
          <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium">Order not available</p>
          <p className="mt-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
            This order isn&apos;t visible to your role, or the reference is wrong.
          </p>
        </div>
      </Page>
    );
  }

  // The same rule the database enforces, surfaced early: after a quote the
  // brief is what the price was calculated against. Showing an editable form
  // that the server would then refuse is a worse experience than saying so.
  const frozen = !["DRAFT", "SUBMITTED"].includes(order.status);
  // The client writes their brief; on an order the team placed from email,
  // WhatsApp or phone, the team may too (0043 — the database checks it).
  const isOwner =
    order.relation === "CLIENT" ||
    ((order.relation === "ADMIN" || order.relation === "POD_LEAD") && !!order.source && order.source !== "portal");

  // Private bucket: each picture needs its own short-lived signed URL. Minted
  // with the service role because the browser session has no storage grant —
  // the ROW was already filtered by RLS, so this only signs what the viewer was
  // allowed to see.
  const admin = createAdminSupabaseClient();
  const images: ReferenceImage[] = [];
  for (const row of (imagesRes.data ?? []) as ImageRow[]) {
    const { data: signed } = await admin.storage
      .from(ORDER_FILES_BUCKET)
      .createSignedUrl(row.object_key, REFERENCE_URL_TTL_SECONDS);
    if (!signed?.signedUrl) continue;
    images.push({
      id: row.id,
      signedUrl: signed.signedUrl,
      isPrimary: row.is_primary,
      pins: (row.order_reference_pins ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p): Pin => ({ xBp: p.x_bp, yBp: p.y_bp, label: p.label })),
    });
  }

  const spec = specRes.data as SpecRow | null;

  // A brand-new brief starts from the client's own last answers (metal,
  // karat, finish, files, purpose) and their ring size as a hint. Only their
  // own orders: RLS limits what a client reads, and staff never get this.
  let last: Partial<SpecRow> | null = null;
  let lastRingSize: string | null = null;
  if (order.relation === "CLIENT" && !spec) {
    const { data: recent } = await supabase
      .from("order_specs")
      .select("metal, karatage, finish, format, purpose, ring_size, product")
      .neq("order_id", id)
      .order("updated_at", { ascending: false })
      .limit(10);
    const rows = (recent ?? []) as Partial<SpecRow>[];
    last = rows[0] ?? null;
    lastRingSize = rows.find((r) => r.ring_size)?.ring_size ?? null;
  }
  const accents: AccentRow[] = ((accentsRes.data ?? []) as AccentDbRow[]).map((a) => ({
    shape: a.shape,
    setting: a.setting,
    widthMm: String(a.width_um / 1000),
    quantity: String(a.quantity),
  }));

  return (
    <Page form>
      <BackLink id={id} />

      <PageHeader
        className="mt-4"
        eyebrow={order.display_ref ?? undefined}
        title={order.service === "render" ? "Render brief" : "CAD brief"}
      />

      <div className="mt-6">
        {isOwner ? (
          <BriefWizard
            orderId={id}
            service={order.service ?? "cad"}
            readOnly={frozen}
            images={images}
            lastRingSize={lastRingSize}
            initialStep={Number((await searchParams).step) || 0}
            defaults={{
              referenceName: spec?.reference_name,
              product: spec?.product,
              metal: spec?.metal ?? last?.metal ?? undefined,
              karatage: spec?.karatage ?? last?.karatage ?? undefined,
              purpose: spec?.purpose ?? last?.purpose ?? undefined,
              format: spec?.format ?? last?.format ?? undefined,
              finish: spec?.finish ?? last?.finish ?? undefined,
              hasCentreStone: spec?.has_centre_stone,
              centreShape: spec?.centre_shape,
              centreSetting: spec?.centre_setting,
              centreQuantity: spec?.centre_quantity,
              centreLengthUm: spec?.centre_length_um,
              centreWidthUm: spec?.centre_width_um,
              centreDepthUm: spec?.centre_depth_um,
              ringSize: spec?.ring_size,
              innerCircumferenceUm: spec?.inner_circumference_um,
              innerDiameterUm: spec?.inner_diameter_um,
              lengthUm: spec?.length_um,
              renderViews: spec?.render_views,
              notes: spec?.notes,
              accents,
            }}
          />
        ) : (
          // A designer or staff member reading someone else's brief. Read-only
          // by construction: the write function refuses anyone but the client
          // (and, on team-placed orders, the team).
          <ReadOnlyBrief spec={spec} accents={accents} photos={images.length} />
        )}
      </div>

      {/* The owner edits photos inside the brief's first step; a frozen brief
          or someone else's shows them read-only here. */}
      {(frozen || !isOwner) && <ReferenceSection orderId={id} images={images} readOnly />}
    </Page>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/orders/${id}`}
      className="inline-flex min-h-[var(--ctl)] items-center gap-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground transition-colors hover:text-foreground"
    >
      ← Order
    </Link>
  );
}

function ReadOnlyBrief({ spec, accents, photos }: { spec: SpecRow | null; accents: AccentRow[]; photos: number }) {
  if (!spec) {
    return (
      <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-10)] text-center">
        <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)] font-medium">No brief yet</p>
        <p className="mt-1 text-[length:var(--fs-3)] leading-[var(--lh-3)] text-muted-foreground">
          The client has not filled this in.
        </p>
      </div>
    );
  }

  const rows = briefRows(spec as unknown as Record<string, unknown>, {
    service: spec.render_views ? "render" : "cad",
    photos: photos,
    accents: accents.map((a) => ({
      quantity: Number(a.quantity) || 0,
      shape: a.shape,
      width_um: Math.round(Number(a.widthMm) * 1000) || 0,
      setting: a.setting,
    })),
    detail: true,
  })
    .filter((r) => r.key !== "name" && r.key !== "photos")
    .map((r): [string, string] => [r.label, r.value ?? "—"]);

  return (
    <dl className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
      {rows.map(([k, v]) => (
        <div key={k} className="px-4 py-3">
          <dt className="text-[length:var(--fs-2)] text-muted-foreground">
            {k}
          </dt>
          <dd className="mt-0.5 text-[length:var(--fs-4)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
