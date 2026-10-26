import { cn } from "@/lib/utils";

/**
 * Alerts pinned to the top of a work screen (redesign): one row per thing
 * that is already late or contested, each with a plain sentence and at most
 * one action. Tone is the left edge and the icon; the words carry the meaning.
 */
export interface Alert {
  key: string;
  tone: "danger" | "warning" | "attention";
  icon: React.ReactNode;
  text: React.ReactNode;
  action?: React.ReactNode;
}

const EDGE: Record<Alert["tone"], string> = {
  danger: "before:bg-[color:var(--tone-danger-fg)] [&_[data-icon]]:text-[color:var(--tone-danger-fg)]",
  warning: "before:bg-[color:var(--tone-warning-fg)] [&_[data-icon]]:text-[color:var(--tone-warning-fg)]",
  attention: "before:bg-foreground [&_[data-icon]]:text-foreground",
};

export function AlertList({ alerts, label = "Needs attention" }: { alerts: Alert[]; label?: string }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label={label}>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        {alerts.map((a) => (
          <li
            key={a.key}
            className={cn(
              "relative flex flex-col gap-3 py-3 pl-5 pr-4 sm:flex-row sm:items-center",
              "before:absolute before:inset-y-0 before:left-0 before:w-1",
              EDGE[a.tone],
            )}
          >
            <p className="flex min-w-0 flex-1 items-start gap-2.5 text-[length:var(--fs-3)] leading-[var(--lh-3)]">
              <span data-icon className="mt-[0.2em] shrink-0 [&_svg]:h-[1.1em] [&_svg]:w-[1.1em]" aria-hidden>
                {a.icon}
              </span>
              <span>{a.text}</span>
            </p>
            {a.action && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{a.action}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
