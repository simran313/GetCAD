import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { STAGE_LABELS, type StaffStage } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { OrdersList, parseTab } from "@/components/work/orders-list";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

/** P3 — every order in the pod lead's pods (docs/design). */
export const dynamic = "force-dynamic";

export default async function PodOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; stage?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");
  const { tab, q, stage: rawStage } = await searchParams;
  const stage = STAGE_LABELS.some(([s]) => s === rawStage) ? (rawStage as StaffStage) : null;

  let jobs: PodJob[];
  try {
    jobs = await loadPodJobs(supabase);
  } catch (e) {
    return (
      <Page>
        <ErrorPanel title="Couldn't load the orders" message={`${(e as Error).message} — reload the page to try again.`} />
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader
        title="All orders"
        description="Every order in your pods, by reference."
        actions={
          <Link href="/admin/new-order" className={buttonVariants()}>
            Create order
          </Link>
        }
      />
      <OrdersList jobs={jobs} basePath="/qc/orders" tab={parseTab(tab)} q={q} stage={stage} />
    </Page>
  );
}
