import type { Metadata } from "next";

import { StlViewer } from "@/components/preview/stl-viewer";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { productWord } from "@/lib/client/orders";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * The branded preview a jeweler sends their customer (SPEC-ADDENDUM A5).
 * Outside the app and the website: no sign-in, no navigation, nothing of
 * ours — the jeweler's logo and name, a rotatable model and the renders.
 * preview_by_token() (server only) checks the link and counts the view; an
 * expired, revoked or unknown link reads the same: "not available".
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design preview", robots: { index: false, follow: false } };

interface Preview {
  jeweler: string;
  logo_key: string | null;
  product: string | null;
  stl_key: string | null;
  renders: { slot: string; key: string }[];
}

const VIEW: Record<string, string> = { TV: "Top", PV: "Perspective", RV: "Right", FV: "Front", BV: "Back" };

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminSupabaseClient();
  const { data } = await admin.rpc("preview_by_token", { p_token: token });
  const p = data as Preview | null;

  if (!p) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <p className="text-[length:var(--fs-4)] font-medium">This preview is not available</p>
          <p className="mt-2 text-[length:var(--fs-3)] text-muted-foreground">
            The link may have expired or been turned off. Ask your jeweler for a new one.
          </p>
        </div>
      </main>
    );
  }

  const storage = admin.storage.from(ORDER_FILES_BUCKET);
  const sign = async (key: string | null) => (key ? (await storage.createSignedUrl(key, 60 * 15)).data?.signedUrl ?? null : null);
  const [logo, stl, renders] = await Promise.all([
    sign(p.logo_key),
    sign(p.stl_key),
    Promise.all(p.renders.map(async (r) => ({ slot: r.slot, url: await sign(r.key) }))),
  ]);
  const piece = productWord(p.product);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          {logo && <img src={logo} alt="" className="h-10 w-auto max-w-[160px] object-contain" />}
          <p className="text-[length:var(--fs-4)] font-medium">{p.jeweler}</p>
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <p className="font-mono text-[length:var(--fs-1)] uppercase tracking-[0.12em] text-muted-foreground">Design preview</p>
          <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.05]">Your {piece.toLowerCase()}</h1>
          <p className="mt-2 text-[length:var(--fs-3)] text-muted-foreground">Drag to turn it. Colours and finish are shown in the pictures below.</p>
        </div>
        {stl && <StlViewer url={stl} label={`3D model of the ${piece.toLowerCase()}`} />}
        {renders.some((r) => r.url) && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {renders
              .filter((r) => r.url)
              .map((r) => (
                <li key={r.slot}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img src={r.url!} alt={`${VIEW[r.slot] ?? r.slot} view`} className="aspect-square w-full rounded-[var(--r-sm)] border border-border object-cover" />
                  <p className="mt-1 font-mono text-[length:var(--fs-1)] uppercase tracking-[0.08em] text-muted-foreground">
                    {VIEW[r.slot] ?? r.slot}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </div>
    </main>
  );
}
