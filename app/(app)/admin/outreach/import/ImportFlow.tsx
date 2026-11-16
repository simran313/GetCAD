"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  IMPORT_CHUNK,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  KINDS,
  type ImportField,
  buildRows,
  chunk,
  guessMapping,
  looksLikeHeader,
  parseTable,
} from "@/core/outreach";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pills } from "@/components/ui/pills";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { type ImportPartResult, importDoneAction, importPartAction } from "../actions";
import { td, th } from "../shared";

interface SenderOption {
  id: string;
  label: string;
  address: string;
  channel: string;
  for_kind: string;
}

type Totals = Omit<ImportPartResult, "import_id">;
const ZERO: Totals = { total: 0, added: 0, duplicates: 0, skipped_clients: 0, invalid: 0, errors: [] };

/**
 * Read the file here, in the browser; let the person check which column is
 * which; then send the rows in parts of 500 under one import, so a large list
 * neither times out nor holds the database for long.
 */
export function ImportFlow({ senders }: { senders: SenderOption[] }) {
  const [kind, setKind] = useState<string>("EXISTING");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [source, setSource] = useState("");
  const [sender, setSender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<Totals | null>(null);
  const [pending, start] = useTransition();

  function load(text: string, name: string | null) {
    setError(null);
    setResult(null);
    const t = parseTable(text);
    if (t.length === 0) return setError("Nothing to read in that file.");
    if (t.length > IMPORT_MAX_ROWS + 1) return setError(`${IMPORT_MAX_ROWS.toLocaleString("en-US")} rows at most in one import. Split the file.`);
    const header = looksLikeHeader(t[0]!);
    setTable(t);
    setFileName(name);
    setHasHeader(header);
    setMapping(header ? guessMapping(t[0]!) : t[0]!.map(() => null));
  }

  const width = useMemo(() => table.reduce((w, r) => Math.max(w, r.length), 0), [table]);
  const rows = useMemo(() => (table.length ? buildRows(table, mapping, hasHeader) : []), [table, mapping, hasHeader]);
  const mapped = new Set(mapping.filter(Boolean));
  const reachable = ["email", "phone", "whatsapp", "instagram", "linkedin"].some((f) => mapped.has(f as ImportField));
  const named = ["business_name", "contact_name", "email"].some((f) => mapped.has(f as ImportField));
  const eligible = senders.filter((s) => s.channel === "EMAIL" && (s.for_kind === kind || s.for_kind === "ANY"));

  function run() {
    setError(null);
    start(async () => {
      const parts = chunk(rows, IMPORT_CHUNK);
      let importId: string | null = null;
      const sum: Totals = { ...ZERO, errors: [] };
      setProgress({ done: 0, of: rows.length });
      for (const part of parts) {
        const r = await importPartAction({ importId, kind, fileName, source: source.trim() || null, senderId: sender || null, rows: part });
        if (!r.ok || !r.data) {
          setError(`${r.ok ? "No answer from the server." : r.error} ${sum.added} were added before this.`);
          break;
        }
        importId = r.data.import_id;
        for (const k of ["total", "added", "duplicates", "skipped_clients", "invalid"] as const) sum[k] += r.data[k];
        sum.errors.push(...r.data.errors);
        setProgress({ done: sum.total, of: rows.length });
      }
      await importDoneAction();
      setResult(sum);
      setProgress(null);
    });
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Imported {result.added} of {result.total}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-[length:var(--fs-3)]">
          <p>
            {result.duplicates} already in outreach · {result.skipped_clients} already clients · {result.invalid} unusable.
          </p>
          {result.errors.length > 0 && (
            <ul className="list-inside list-disc text-[length:var(--fs-2)] text-muted-foreground">
              {result.errors.map((e) => (
                <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="text-[color:var(--tone-danger-fg)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/outreach?stage=NEW" className={buttonVariants()}>
              See the new contacts
            </Link>
            <Button type="button" variant="secondary" onClick={() => { setResult(null); setTable([]); setFileName(null); }}>
              Import another
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-5">
          {/* Pills is uncontrolled; the radios' change bubbles up to here. */}
          <div
            onChange={(e) => {
              const t = e.target as HTMLInputElement;
              if (t.name === "kind") setKind(t.value);
            }}
          >
            <Pills
              name="kind"
              legend="Which list"
              defaultValue={kind}
              options={KINDS.map(([v]) => ({ value: v, label: v === "PROSPECT" ? "Prospects (found by research)" : "Existing contacts (people you know)" }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="File" htmlFor="file" hint="CSV or tab-separated. In Excel or Sheets: File → Download or Save as → CSV.">
              <Input
                id="file"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) load(await f.text(), f.name);
                }}
              />
            </Field>
            <Field label="Where the list came from" htmlFor="source" optional hint="Kept on every contact, e.g. “JCK 2026 cards” or “Google Maps, Texas”.">
              <Input id="source" value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} />
            </Field>
          </div>
          <Field label="Or paste cells from a spreadsheet" htmlFor="paste" optional>
            <Textarea
              id="paste"
              rows={3}
              placeholder="Copy the cells, headings included, and paste here"
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) {
                  e.preventDefault();
                  load(text, null);
                }
              }}
            />
          </Field>
          {error && !progress && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
        </CardBody>
      </Card>

      {table.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>Which column is which</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <label className="flex items-center gap-2 text-[length:var(--fs-2)]">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => {
                  setHasHeader(e.target.checked);
                  setMapping(e.target.checked ? guessMapping(table[0]!) : table[0]!.map(() => null));
                }}
              />
              The first row is headings
            </label>
            <table className="w-full text-left text-[length:var(--fs-2)]">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {Array.from({ length: width }, (_, col) => (
                    <th key={col} className={`${th} min-w-40`}>
                      <span className="mb-1 block truncate">{hasHeader ? table[0]![col] || `Column ${col + 1}` : `Column ${col + 1}`}</span>
                      <Select
                        aria-label={`Field for column ${col + 1}`}
                        value={mapping[col] ?? ""}
                        onChange={(e) => {
                          const next = [...mapping];
                          while (next.length < width) next.push(null);
                          next[col] = (e.target.value || null) as ImportField | null;
                          setMapping(next);
                        }}
                      >
                        <option value="">Leave out</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 5).map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    {Array.from({ length: width }, (_, col) => (
                      <td key={col} className={`${td} max-w-56 truncate ${mapping[col] ? "" : "text-muted-foreground line-through"}`}>
                        {r[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[length:var(--fs-2)] text-muted-foreground">
              First rows shown. {rows.length.toLocaleString("en-US")} contacts to import{fileName ? ` from ${fileName}` : ""}.
            </p>
          </CardBody>
        </Card>
      )}

      {table.length > 0 && (
        <Card>
          <CardBody className="space-y-4">
            <Field
              label="Send from"
              htmlFor="sender"
              hint={
                eligible.length === 0
                  ? "No active email sender for this list yet: contacts are added without one (an admin sets senders up)."
                  : "Spread evenly gives each address the same share, so their replies can be compared."
              }
            >
              <Select id="sender" value={sender} onChange={(e) => setSender(e.target.value)}>
                <option value="">{eligible.length > 1 ? `Spread evenly over ${eligible.length} senders` : eligible.length === 1 ? eligible[0]!.label : "No sender"}</option>
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    Only {s.label} ({s.address})
                  </option>
                ))}
              </Select>
            </Field>
            {!named && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">Choose the column with the business name, contact name or email.</p>}
            {named && !reachable && (
              <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">
                Choose at least one way to reach them: email, phone, WhatsApp, Instagram or LinkedIn.
              </p>
            )}
            {progress && (
              <p aria-live="polite" className="text-[length:var(--fs-2)] text-muted-foreground">
                Importing {progress.done.toLocaleString("en-US")} of {progress.of.toLocaleString("en-US")}…
              </p>
            )}
            <Button type="button" disabled={pending || !named || !reachable || rows.length === 0} onClick={run}>
              {pending ? "Importing…" : `Import ${rows.length.toLocaleString("en-US")} contacts`}
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
