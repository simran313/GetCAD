import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { STAGE_LABELS, type StaffStage } from "@/core";
import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { OrdersList, parseTab } from "@/components/work/orders-list";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, type PodJob } from "@/lib/work/load";

/** A2 — every order, by reference only (docs/design). */
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; stage?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  await supabase.rpc("ensure_self");
  const { tab, q, stage: rawStage } = await searchParams;
  const stage = STAGE_LABELS.some(([s]) => s === rawStage) ? (rawStage as StaffStage) : null;

  let jobs: PodJob[];
  try {
    jobs = await loadPodJobs(supabase);
  } catch (e) {
    return (
      <main className="container max-w-6xl py-8">
        <ErrorPanel title="Couldn't load the orders" message={`${(e as Error).message} — reload the page to try again.`} />
      </main>
    );
  }
  return (
    <main className="container max-w-6xl space-y-6 py-8">
      <PageHeader
        eyebrow="References only · never names"
        title="All orders"
        actions={
          <>
            <a href="/admin/orders/export" className={buttonVariants({ variant: "outline" })}>
              Export CSV
            </a>
            <Link href="/admin/new-order" className={buttonVariants()}>
              Create order
            </Link>
          </>
        }
      />
      <OrdersList jobs={jobs} basePath="/admin/orders" tab={parseTab(tab)} q={q} stage={stage} />
    </main>
  );
}
