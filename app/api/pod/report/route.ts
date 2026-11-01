import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { durationWord, formatDate, toCsv, toXlsx } from "@/core";
import { renderPodReport } from "@/lib/pdf/podReport";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { viewerZone } from "@/lib/time/zone";
import { designerName, loadPodReport, periodKey } from "@/lib/work/pod";
import { activityRows, designerRows, jobRows, reportSheets } from "@/lib/work/podExport";
import { requireTeam } from "@/lib/work/team";

/**
 * The pod report download (Phase 13c): Excel (three sheets: designers, jobs,
 * activity), CSV (one sheet; ?sheet=designers|jobs|activity) or PDF.
 * Read as the caller, so a pod lead gets their pods and an admin all.
 */
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const supabase = await createUserSupabaseClient();
  if (!(await requireTeam(supabase))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const zone = await viewerZone();
  const period = periodKey(sp.get("period") ?? undefined);
  const r = await loadPodReport(supabase, {
    period,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    zone,
    filters: { designer: sp.get("designer") || undefined, category: sp.get("category") || undefined, product: sp.get("product") || undefined },
  });
  const label = `${formatDate(r.period.from, zone)} – ${formatDate(new Date(r.period.to.getTime() - 1), zone)}`;
  const stamp = r.period.to.toISOString().slice(0, 10);
  const headers = (type: string, name: string) => ({
    "content-type": type,
    "content-disposition": `attachment; filename="pod-report-${stamp}.${name}"`,
    "cache-control": "private, no-store",
  });

  const format = sp.get("format");
  if (format === "csv") {
    const sheet = sp.get("sheet");
    const rows = sheet === "jobs" ? jobRows(r, zone) : sheet === "activity" ? activityRows(r, zone) : designerRows(r);
    return new NextResponse(toCsv(rows), { headers: headers("text/csv; charset=utf-8", "csv") });
  }
  if (format === "pdf") {
    const t = r.team;
    const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
    const pdf = await renderPodReport({
      title: [...new Set(r.designers.map((d) => d.pod_name))].join(", ") || "Pod report",
      periodLabel: `${label}${sp.get("designer") ? ` · ${designerName(r.designers[0])}` : ""}`,
      kpis: [
        ["Submitted to QC", String(t.submitted)],
        ["Passed QC", String(t.passed)],
        ["On time", pct(t.onTimeRate)],
        ["First-pass QC", pct(t.firstPassRate)],
        ["Avg working time", t.avgActiveMs == null ? "—" : durationWord(t.avgActiveMs)],
        ["Avg turnaround", t.avgTurnaroundMs == null ? "—" : durationWord(t.avgTurnaroundMs)],
      ],
      bottlenecks: [
        ["Waiting for a designer", String(r.bottlenecks.unassigned)],
        ["Waiting for QC", String(r.bottlenecks.waitingQc)],
        ["Overdue to QC", String(r.bottlenecks.overdue)],
        ["Paused now", String(r.bottlenecks.paused)],
        ["Idle designers", r.bottlenecks.idle.map((d) => designerName(d)).join(", ") || "None"],
      ],
      table: designerRows(r),
    });
    return new NextResponse(new Uint8Array(pdf), { headers: headers("application/pdf", "pdf") });
  }
  const xlsx = toXlsx(reportSheets(r, zone));
  return new NextResponse(new Uint8Array(xlsx), {
    headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
  });
}
