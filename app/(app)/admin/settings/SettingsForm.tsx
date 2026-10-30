"use client";

import { ChevronRight } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";

import { InputWithUnit } from "@/components/ui/input-suffix";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { setFlagAction, setSettingAction } from "./actions";
import { FIELDS, FLAGS, SECTIONS, toShown, toStored, withUnit, type Field } from "./fields";
import { actionErrorText } from "@/lib/refusal";

/**
 * Settings, interactive half (redesign A11). Human labels and units; one save
 * bar for every change on the page, listing each before → after; switches
 * apply at once with a toast. The raw keys and stored numbers are kept in a
 * closed "Developer" panel at the foot.
 */
export interface SettingRow {
  key: string;
  value: number | null;
  description: string;
}
export interface FlagRow {
  key: string;
  enabled: boolean;
  description: string;
}
export interface Changed {
  by: string;
  at: string;
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/** A setting with no entry in FIELDS still shows, as its stored number. */
const fieldFor = (row: SettingRow): Field => FIELDS[row.key] ?? { label: row.description, unit: "", scale: 1, decimals: 0, optional: true };

function Switch({ flag, editable }: { flag: FlagRow; editable: boolean }) {
  const meta = FLAGS[flag.key];
  const [on, setOn] = useState(flag.enabled);
  const [pending, start] = useTransition();
  const id = useId();
  const label = meta?.label ?? flag.description;
  return (
    <li className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[length:var(--fs-3)] font-medium leading-[var(--lh-3)]">
          {label}
        </label>
        {meta?.help && <p className="text-[length:var(--fs-2)] text-muted-foreground">{meta.help}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!editable || pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            try {
              await setFlagAction(fd({ key: flag.key, enabled: next ? "1" : "0" }));
              toast(`${label}: ${next ? "on" : "off"}`);
            } catch (e) {
              setOn(!next);
              toast(`Not changed: ${actionErrorText(e) ?? "the database refused it"}`, "danger");
            }
          });
        }}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-[var(--dur-fast)]",
          "before:absolute before:-inset-2 before:content-['']", // 44px tap target
          on ? "border-foreground bg-foreground" : "border-[color:var(--input)] bg-muted",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="sr-only">{on ? "On" : "Off"}</span>
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow-[var(--e-1)] transition-transform duration-[var(--dur-fast)]",
            on ? "translate-x-[24px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </li>
  );
}

export function SettingsForm({
  settings,
  flags,
  changed,
  editable,
}: {
  settings: SettingRow[];
  flags: FlagRow[];
  /** Per section id (and "flags"): the most recent recorded change. */
  changed: Record<string, Changed | undefined>;
  editable: boolean;
}) {
  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(settings.map((s) => [s.key, toShown(s.value, fieldFor(s))])));
  const [draft, setDraft] = useState(saved);
  const [saving, start] = useTransition();

  const known = new Set(SECTIONS.flatMap((s) => s.keys));
  const sections = [
    ...SECTIONS.map((s) => ({ ...s, keys: s.keys.filter((k) => byKey.has(k)) })),
    { id: "other", title: "Other", description: "Settings added after this screen was designed.", keys: settings.map((s) => s.key).filter((k) => !known.has(k)) },
  ].filter((s) => s.keys.length > 0);

  const dirty = Object.keys(draft).filter((k) => draft[k] !== saved[k]);
  const errors = Object.fromEntries(
    dirty.map((k) => {
      const r = toStored(draft[k]!, fieldFor(byKey.get(k)!));
      return [k, "error" in r ? r.error : null];
    }),
  );
  const invalid = dirty.some((k) => errors[k]);
  const changes = dirty
    .map((k) => ({ k, f: fieldFor(byKey.get(k)!) }))
    .sort((a, b) => Number(!!b.f.critical) - Number(!!a.f.critical))
    .map(({ k, f }) => ({ label: f.label, before: withUnit(saved[k]!, f), after: withUnit(draft[k]!, f) }));

  const save = () => {
    if (invalid) {
      toast("Fix the highlighted values first", "danger");
      return;
    }
    start(async () => {
      const done: string[] = [];
      for (const k of dirty) {
        const r = toStored(draft[k]!, fieldFor(byKey.get(k)!));
        if ("error" in r) continue;
        try {
          await setSettingAction(fd({ key: k, value: r.value === null ? "" : String(r.value) }));
          done.push(k);
        } catch (e) {
          toast(`${fieldFor(byKey.get(k)!).label} not saved: ${actionErrorText(e) ?? "the database refused it"}`, "danger");
          break;
        }
      }
      if (done.length) {
        setSaved((s) => ({ ...s, ...Object.fromEntries(done.map((k) => [k, draft[k]!])) }));
        toast(done.length === 1 ? "Change saved" : `${done.length} changes saved`);
      }
    });
  };

  return (
    <div className="space-y-6 pb-32">
      {sections.map((sec) => (
        <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
          <header className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id={`sec-${sec.id}`} className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
                {sec.title}
                {sec.keys.some((k) => dirty.includes(k)) && (
                  <span className="ml-2 align-middle text-[length:var(--fs-1)] font-medium text-muted-foreground">· Unsaved</span>
                )}
              </h2>
              <p className="text-[length:var(--fs-2)] text-muted-foreground">{sec.description}</p>
            </div>
            {changed[sec.id] && (
              <p className="shrink-0 text-[length:var(--fs-2)] text-muted-foreground sm:text-right">
                Last changed by {changed[sec.id]!.by}, {changed[sec.id]!.at}
              </p>
            )}
          </header>
          <ul className="divide-y divide-border px-5">
            {sec.keys.map((k) => {
              const f = fieldFor(byKey.get(k)!);
              const err = errors[k];
              const id = `set-${k}`;
              return (
                <li key={k} className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <label htmlFor={id} className="text-[length:var(--fs-3)] font-medium leading-[var(--lh-3)]">
                      {f.label}
                    </label>
                    {f.help && <p className="text-[length:var(--fs-2)] text-muted-foreground">{f.help}</p>}
                  </div>
                  <div className="min-w-0">
                    <InputWithUnit
                      id={id}
                      name={k}
                      unit={f.unit || "number"}
                      prefix={f.prefix}
                      inputMode={f.decimals ? "decimal" : "numeric"}
                      value={draft[k] ?? ""}
                      disabled={!editable || saving}
                      placeholder={f.optional ? "Not set" : undefined}
                      aria-invalid={err ? true : undefined}
                      aria-errormessage={err ? `${id}-err` : undefined}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      className={cn(err && "border-[color:var(--tone-danger-fg)]", draft[k] !== saved[k] && !err && "border-foreground")}
                    />
                    {err && (
                      <p id={`${id}-err`} className="mt-1 text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">
                        {err}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="sec-flags" className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
        <header className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="sec-flags" className="text-[length:var(--fs-4)] leading-[var(--lh-4)]">
              Features
            </h2>
            <p className="text-[length:var(--fs-2)] text-muted-foreground">A switch applies at once. The database honours it too, not just this screen.</p>
          </div>
          {changed.flags && (
            <p className="shrink-0 text-[length:var(--fs-2)] text-muted-foreground sm:text-right">
              Last changed by {changed.flags.by}, {changed.flags.at}
            </p>
          )}
        </header>
        <ul className="divide-y divide-border px-5">
          {[...flags]
            .sort((a, b) => Object.keys(FLAGS).indexOf(a.key) - Object.keys(FLAGS).indexOf(b.key))
            .map((f) => (
              <Switch key={f.key} flag={f} editable={editable} />
            ))}
        </ul>
      </section>

      <details className="group rounded-[var(--r-lg)] border border-border bg-card">
        <summary className="flex min-h-[var(--ctl)] cursor-pointer list-none items-center gap-2 px-5 text-[length:var(--fs-3)] font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 transition-transform duration-[var(--dur-fast)] group-open:rotate-90" aria-hidden />
          Developer
          <span className="font-normal text-muted-foreground">· raw keys and stored values</span>
        </summary>
        <div className="overflow-x-auto border-t border-border px-5 py-4">
          <table className="w-full text-left font-mono text-[length:var(--fs-2)]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-4 font-normal">key</th>
                <th className="py-1.5 pr-4 text-right font-normal">stored</th>
                <th className="py-1.5 font-normal">description</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.key} className="border-t border-border">
                  <td className="py-1.5 pr-4">{s.key}</td>
                  <td className="tabular py-1.5 pr-4 text-right">{s.value ?? "null"}</td>
                  <td className="py-1.5 font-sans text-muted-foreground">{s.description}</td>
                </tr>
              ))}
              {flags.map((f) => (
                <tr key={f.key} className="border-t border-border">
                  <td className="py-1.5 pr-4">{f.key}</td>
                  <td className="py-1.5 pr-4 text-right">{String(f.enabled)}</td>
                  <td className="py-1.5 font-sans text-muted-foreground">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {editable && (
        <StickySaveBar
          dirty={dirty.length > 0}
          changes={changes}
          saving={saving}
          onDiscard={() => setDraft(saved)}
          onSave={save}
        />
      )}
    </div>
  );
}
