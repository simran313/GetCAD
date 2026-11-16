import { STAGES } from "@/core/outreach";
import { cn } from "@/lib/utils";

/**
 * The outreach dashboard's charts (DECISIONS 1.33): plain HTML bars, no chart
 * library, so nothing loads anywhere else. Colours come from the --viz tokens
 * in app/globals.css (validated for colour-blind separation); text stays in
 * the text colours; every mark shows its numbers on hover or keyboard focus,
 * and the numbers are also in the tables under the charts.
 */

/** Hover or focus a mark to read its numbers. */
function Tip({ children, label, className, style }: { children: React.ReactNode; label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div tabIndex={0} aria-label={label} style={style} className={cn("group/tip relative rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-foreground", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--r-xs)] bg-foreground px-2 py-1 text-[length:var(--fs-2)] text-background shadow-[var(--e-2)] group-hover/tip:block group-focus/tip:block"
      >
        {label}
      </span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}

export function Legend({ items }: { items: { label: string; color: string; value?: React.ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-2)] text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          <span className="text-foreground">{i.label}</span>
          {i.value !== undefined && <span className="tabular">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Written to → replied → interested → became a client → ordered: one bar per stage, darker as it narrows. */
export function FunnelChart({ steps }: { steps: { label: string; n: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.n : null;
        const share = prev !== null ? `${pct(s.n, prev)}% of ${steps[i - 1]!.label.toLowerCase()}` : "";
        return (
          <li key={s.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 text-[length:var(--fs-2)]">
            <span className="truncate">{s.label}</span>
            <Tip label={`${s.label}: ${s.n}${share ? ` (${share})` : ""}`}>
              <div className="h-3.5 w-full rounded-[4px] bg-[var(--viz-grid)]/40">
                <div
                  className="h-3.5 rounded-[4px]"
                  style={{ width: `${s.n === 0 ? 0 : Math.max(2, (s.n / max) * 100)}%`, background: `var(--viz-step-${Math.min(i + 1, 5)})` }}
                />
              </div>
            </Tip>
            <span className="tabular text-right">
              <span className="font-semibold">{s.n}</span>
              {prev !== null && <span className="ml-1.5 text-muted-foreground">{pct(s.n, prev)}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Messages sent and replies, a day, for the last 14 days. */
export function DailyChart({ days }: { days: { day: string; sent: number; replied: number }[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.sent, d.replied)));
  const top = Math.ceil(max / 5) * 5;
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: "Sent", color: "var(--viz-sent)", value: days.reduce((s, d) => s + d.sent, 0) },
          { label: "Replies", color: "var(--viz-reply)", value: days.reduce((s, d) => s + d.replied, 0) },
        ]}
      />
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-[var(--viz-grid)]" aria-hidden />
        <span className="tabular absolute -top-2 right-0 bg-card pl-1 text-[length:var(--fs-2)] text-muted-foreground" aria-hidden>
          {top}
        </span>
        <div className="flex h-36 items-end gap-[3px] border-b border-[var(--viz-axis)] sm:gap-1.5">
          {days.map((d) => (
            <Tip key={d.day} label={`${dayLabel(d.day)}: ${d.sent} sent, ${d.replied} ${d.replied === 1 ? "reply" : "replies"}`} className="flex h-full flex-1 items-end justify-center gap-[2px]">
              <div className="w-full max-w-3 rounded-t-[4px]" style={{ height: `${(d.sent / top) * 100}%`, background: "var(--viz-sent)" }} />
              <div className="w-full max-w-3 rounded-t-[4px]" style={{ height: `${(d.replied / top) * 100}%`, background: "var(--viz-reply)" }} />
            </Tip>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[length:var(--fs-2)] text-muted-foreground">
          <span>{days[0] && dayLabel(days[0].day)}</span>
          <span>{days[7] && dayLabel(days[7].day)}</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

/** Each sender: how many it wrote to, how many replied, and the rate, to compare addresses. */
export function SenderChart({ senders }: { senders: { id: string; label: string; contacted: number; replied: number; active: boolean }[] }) {
  const max = Math.max(1, ...senders.map((s) => s.contacted));
  return (
    <div className="space-y-3">
      <Legend items={[{ label: "Written to", color: "var(--viz-sent)" }, { label: "Replied", color: "var(--viz-reply)" }]} />
      <ul className="space-y-3">
        {senders.map((s) => {
          const rate = s.contacted > 0 ? pct(s.replied, s.contacted) : null;
          return (
            <li key={s.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[length:var(--fs-2)]">
              <span className={cn("truncate", !s.active && "text-muted-foreground")}>{s.label}</span>
              <Tip label={`${s.label}: ${s.contacted} written to, ${s.replied} replied${rate !== null ? ` (${rate}%)` : ""}`}>
                <div className="space-y-[2px]">
                  <div className="h-2.5 rounded-[4px]" style={{ width: `${s.contacted === 0 ? 0 : Math.max(2, (s.contacted / max) * 100)}%`, background: "var(--viz-sent)" }} />
                  <div className="h-2.5 rounded-[4px]" style={{ width: `${s.replied === 0 ? 0 : Math.max(2, (s.replied / max) * 100)}%`, background: "var(--viz-reply)" }} />
                </div>
              </Tip>
              <span className="tabular text-right font-semibold">{rate === null ? "—" : `${rate}%`}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--fs-2)] text-muted-foreground">Right: reply rate. A sender far below the others may be landing in spam.</p>
    </div>
  );
}

const STAGE_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)"];

/** Each list split by stage, one stacked bar per list. */
export function StageMix({ lists }: { lists: { label: string; counts: Record<string, number> }[] }) {
  const totals = Object.fromEntries(STAGES.map(([s]) => [s, lists.reduce((n, l) => n + (l.counts[s] ?? 0), 0)]));
  return (
    <div className="space-y-4">
      <Legend items={STAGES.map(([s, l], i) => ({ label: l, color: STAGE_COLORS[i]!, value: totals[s] }))} />
      <ul className="space-y-3">
        {lists.map((l) => {
          const total = STAGES.reduce((n, [s]) => n + (l.counts[s] ?? 0), 0);
          return (
            <li key={l.label} className="space-y-1.5 text-[length:var(--fs-2)]">
              <p>
                {l.label} <span className="tabular text-muted-foreground">· {total}</span>
              </p>
              {total === 0 ? (
                <div className="h-4 rounded-[4px] bg-[var(--viz-grid)]/40" />
              ) : (
                <div className="flex h-4 gap-[2px]">
                  {STAGES.map(([s, label], i) => {
                    const n = l.counts[s] ?? 0;
                    if (n === 0) return null;
                    return (
                      <Tip key={s} label={`${l.label}, ${label}: ${n} (${pct(n, total)}%)`} className="h-full min-w-1" style={{ flex: `${n} 1 0` }}>
                        <div className="h-full rounded-[4px]" style={{ background: STAGE_COLORS[i] }} />
                      </Tip>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The templates sent most, by reply rate (bars scaled to the best one). */
export function TemplateChart({ templates }: { templates: { id: string; name: string; sent: number; replied: number }[] }) {
  const best = Math.max(1, ...templates.map((t) => pct(t.replied, t.sent)));
  return (
    <ul className="space-y-3">
      {templates.map((t) => {
        const rate = pct(t.replied, t.sent);
        return (
          <li key={t.id} className="space-y-1 text-[length:var(--fs-2)]">
            <p className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{t.name}</span>
              <span className="tabular shrink-0">
                <span className="font-semibold">{rate}%</span>
                <span className="ml-1.5 text-muted-foreground">
                  {t.replied} of {t.sent}
                </span>
              </span>
            </p>
            <Tip label={`${t.name}: sent ${t.sent}, ${t.replied} replied (${rate}%)`}>
              <div className="h-2.5 w-full rounded-[4px] bg-[var(--viz-grid)]/40">
                <div className="h-2.5 rounded-[4px]" style={{ width: `${rate === 0 ? 0 : Math.max(2, (rate / best) * 100)}%`, background: "var(--viz-reply)" }} />
              </div>
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}
