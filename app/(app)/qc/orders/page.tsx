import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { OrdersList, parseTab } from "@/components/work/orders-list";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { loadPodJobs, type PodJob } from "@/lib/work/load";
import { requireTeam } from "@/lib/work/team";

/** P3 — every order in the pod lead's pods (docs/design). */
export const dynamic = "force-dynamic";

export default async function PodOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) redirect("/home");
  const { tab, q } = await searchParams;

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
        eyebrow="Orders in your pod"
        title="All orders"
        actions={
          <Link href="/admin/new-order" className={buttonVariants()}>
            Create order
          </Link>
        }
      />
      <OrdersList jobs={jobs} basePath="/qc/orders" tab={parseTab(tab)} q={q} />
    </main>
  );
}
