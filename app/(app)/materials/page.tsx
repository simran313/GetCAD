import { auth } from "@clerk/nextjs/server";
import { BookOpen } from "lucide-react";
import { redirect } from "next/navigation";

import { formatDate } from "@/core";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";

import { RemoveMaterial } from "./RemoveMaterial";
import { ShareMaterial } from "./ShareMaterial";

/**
 * Pod materials (Phase 13b): instructions, charts and reference documents
 * the pod lead shares with the pod, each with what it is for. Designers read
 * them; the pod's lead (and admins) share and remove them.
 */
export const dynamic = "force-dynamic";

interface Material {
  id: string;
  pod_name: string;
  title: string;
  description: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  can_manage: boolean;
}

const kindWord = (t: string) => ({ "application/pdf": "PDF", "image/png": "Image", "image/jpeg": "Image", "application/zip": "ZIP", "model/step": "STEP" })[t] ?? "File";
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default async function MaterialsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const tz = await viewerZone();
  const [{ data: me }, { data: list, error }, { data: pods }] = await Promise.all([
    supabase.from("users").select("role").maybeSingle(),
    supabase.rpc("pod_materials"),
    supabase.rpc("material_pods"),
  ]);
  if (me?.role === "CLIENT") redirect("/home");
  const materials = (list ?? []) as Material[];
  const sharePods = (pods ?? []) as { id: string; name: string }[];
  const showPod = new Set(materials.map((m) => m.pod_name)).size > 1;

  return (
    <Page>
      <PageHeader
        title="Materials"
        description={
          sharePods.length > 0
            ? "Instructions, charts and references for your pod. Designers in the pod see everything shared here."
            : "Instructions, charts and references from your pod lead."
        }
      />
      {sharePods.length > 0 && <ShareMaterial pods={sharePods} />}
      {error ? (
        <Card className="p-[var(--s-6)] text-[length:var(--fs-3)] text-muted-foreground">Materials are not available yet.</Card>
      ) : materials.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen />} title="Nothing shared yet" description={sharePods.length > 0 ? "Share the first one above." : "Your pod lead shares instructions and charts here."} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {materials.map((m) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-3 p-[var(--s-5)]">
                <div className="min-w-0">
                  <p className="text-[length:var(--fs-4)] font-medium leading-[var(--lh-4)]">{m.title}</p>
                  <p className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">
                    {[showPod ? m.pod_name : null, kindWord(m.content_type), size(m.size_bytes), formatDate(m.created_at, tz)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {m.description && <p className="whitespace-pre-line text-[length:var(--fs-3)] leading-[var(--lh-3)]">{m.description}</p>}
                <div className="mt-auto flex items-center gap-2">
                  <a href={`/api/materials/${m.id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Open
                  </a>
                  {m.can_manage && <RemoveMaterial id={m.id} title={m.title} />}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
