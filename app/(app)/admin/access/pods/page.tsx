import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadWord } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodLoad, type PodDesignerLoad } from "@/lib/work/load";

import { createPodAction, removePodMemberAction, setPodMemberAction } from "../../actions";
import { Page } from "@/components/ui/page";

/**
 * Pods (Access, Phase 5d): who leads each pod and which designers are in it
 * (DECISIONS §11: admin → pod lead → designer). Replaces the SQL from the
 * Phase 1 and 3a rollouts. A pod lead must hold the QC role; a person is in
 * one pod at a time, so adding moves them. With exactly one pod led by
 * someone, paid orders join it automatically (0048).
 */
export const dynamic = "force-dynamic";

interface Pod {
  pod_id: string;
  name: string;
  lead_id: string | null;
  lead_name: string | null;
  designers: number;
  open_orders: number;
}

interface Account {
  id: string;
  role: string;
  status: string;
  reference: string | null;
}

export default async function PodsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");

  const podsRes = await supabase.rpc("pods_overview");
  if (podsRes.error) {
    return (
      <Page>
        <PageHeader title="Pods" />
        <ErrorPanel title="Not available to your role" message={podsRes.error.message} className="mt-4" />
      </Page>
    );
  }
  const pods = (podsRes.data ?? []) as Pod[];
  const [members, designersRes, qcRes, extraRes, namesRes] = await Promise.all([
    loadPodLoad(supabase).catch(() => [] as PodDesignerLoad[]),
    supabase.rpc("list_platform_users", { p_role: "DESIGNER" }),
    supabase.rpc("list_platform_users", { p_role: "QC" }),
    supabase.from("user_roles").select("user_id, role").eq("role", "QC"),
    supabase.from("staff_profiles").select("user_id, first_name"),
  ]);
  const designers = (designersRes.data ?? []) as Account[];
  const names = new Map(((namesRes.data ?? []) as { user_id: string; first_name: string }[]).map((n) => [n.user_id, n.first_name]));
  const leadIds = [
    ...new Set([
      ...((qcRes.data ?? []) as Account[]).map((a) => a.id),
      ...((extraRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
    ]),
  ];
  const inPod = new Set(members.map((m) => m.designer_id));

  return (
    <Page>
      <Link href="/admin/access" className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← Access
      </Link>
      <PageHeader
        eyebrow="Admin → pod lead → designer"
        title="Pods"
        description={
          pods.filter((p) => p.lead_id).length === 1
            ? "One pod has a lead, so paid orders join it automatically."
            : "With more than one pod, each paid order waits in the Queue until you choose its pod."
        }
      />

      {pods.length === 0 && (
        <Card className="p-[var(--s-6)] text-[length:var(--fs-3)] text-muted-foreground">No pods yet. Create the first one below.</Card>
      )}

      {pods.map((p) => {
        const team = members.filter((m) => m.pod_id === p.pod_id);
        return (
          <Card as="section" key={p.pod_id}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
                {p.designers} designer{p.designers === 1 ? "" : "s"} · {p.open_orders} open order{p.open_orders === 1 ? "" : "s"}
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[length:var(--fs-3)]">
                  Pod lead:{" "}
                  {p.lead_id ? (
                    <span className="font-medium">{p.lead_name ?? p.lead_id}</span>
                  ) : (
                    <StatusTag kind="needs">None</StatusTag>
                  )}
                </p>
                <form action={setPodMemberAction} className="flex items-center gap-2">
                  <input type="hidden" name="pod_id" value={p.pod_id} />
                  <input type="hidden" name="member_role" value="POD_LEAD" />
                  <Select name="user_id" required defaultValue="" aria-label={`Pod lead for ${p.name}`} className="w-auto">
                    <option value="" disabled>
                      {p.lead_id ? "Change pod lead…" : "Choose a pod lead…"}
                    </option>
                    {leadIds.map((id) => (
                      <option key={id} value={id}>
                        {names.get(id) ?? id}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="outline">
                    Set
                  </Button>
                </form>
              </div>

              <ul className="divide-y divide-border rounded-[var(--r-sm)] border border-border">
                {team.length === 0 && <li className="p-[var(--s-3)] text-[length:var(--fs-2)] text-muted-foreground">No designers yet.</li>}
                {team.map((d) => (
                  <li key={d.designer_id} className="flex flex-wrap items-center justify-between gap-3 px-[var(--s-3)] py-[var(--s-2)]">
                    <span className="min-w-0">
                      <span className="block text-[length:var(--fs-3)] font-medium">{d.name ?? d.designer_ref ?? d.designer_id}</span>
                      <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
                        {d.designer_ref ?? "No profile"} · {loadWord(d.open_minutes, d.shift_minutes)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {!d.assignable && <StatusTag kind="muted">Not signed</StatusTag>}
                      <form action={removePodMemberAction}>
                        <input type="hidden" name="user_id" value={d.designer_id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Remove
                        </Button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>

              <form action={setPodMemberAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="pod_id" value={p.pod_id} />
                <input type="hidden" name="member_role" value="DESIGNER" />
                <Select name="user_id" required defaultValue="" aria-label={`Add a designer to ${p.name}`} className="w-auto min-w-0">
                  <option value="" disabled>
                    Add a designer…
                  </option>
                  {designers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.reference ?? `${d.id.slice(0, 14)}… (no profile yet)`}
                      {inPod.has(d.id) ? " · moves from another pod" : ""}
                      {d.status !== "ACTIVE" ? ` · ${d.status.toLowerCase()}` : ""}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>
            </CardBody>
          </Card>
        );
      })}

      <Card as="section">
        <CardHeader>
          <CardTitle>New pod</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={createPodAction} className="flex flex-wrap items-center gap-2">
            <Input name="name" required maxLength={60} placeholder="Pod name, e.g. Rhino pod" aria-label="Pod name" className="max-w-xs" />
            <Button type="submit" size="sm">
              Create pod
            </Button>
          </form>
          <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">
            A designer must apply and sign the agreement before they can be assigned work; until then they show as &quot;Not signed&quot;.
          </p>
        </CardBody>
      </Card>
    </Page>
  );
}
