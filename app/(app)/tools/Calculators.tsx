"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CASTING_ALLOWANCE_G,
  CHARTS,
  POST_ALLOWANCE_G,
  castWeights,
  stoneTotals,
  weightWord,
  type ChartName,
  type StoneLine,
} from "@/core/tools/calculators";

const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(",", ".")));
const th = "py-[var(--s-2)] pr-3 text-left text-[length:var(--fs-2)] font-medium text-muted-foreground";
const td = "py-[var(--s-2)] pr-3 tabular";

export function Calculators({ initialGold }: { initialGold: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
      <GoldCard initial={initialGold} />
      <DiamondCard />
    </div>
  );
}

function GoldCard({ initial }: { initial: string }) {
  const [weight, setWeight] = useState(initial);
  const [casting, setCasting] = useState(String(CASTING_ALLOWANCE_G));
  const [post, setPost] = useState(String(POST_ALLOWANCE_G));
  const rows = castWeights(num(weight), { casting: num(casting) || 0, post: num(post) || 0 });
  return (
    <Card as="section" aria-labelledby="gold-title">
      <CardHeader>
        <CardTitle id="gold-title">Gold casting weight</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="18K cast weight (g)" htmlFor="gold-weight">
            <Input id="gold-weight" type="number" inputMode="decimal" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="5" />
          </Field>
          <Field label="Casting allowance (g)" htmlFor="gold-casting">
            <Input id="gold-casting" type="number" inputMode="decimal" min="0" step="0.01" value={casting} onChange={(e) => setCasting(e.target.value)} />
          </Field>
          <Field label="Post allowance (g)" htmlFor="gold-post">
            <Input id="gold-post" type="number" inputMode="decimal" min="0" step="0.01" value={post} onChange={(e) => setPost(e.target.value)} />
          </Field>
        </div>
        {rows.length === 0 ? (
          <p className="text-[length:var(--fs-2)] text-muted-foreground">Enter the 18K cast weight to see every metal.</p>
        ) : (
          // Scrolls sideways on a narrow phone: focusable, so a keyboard can scroll it too.
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Cast weight per metal">
            <table className="w-full min-w-[22rem] text-[length:var(--fs-3)]">
              <caption className="sr-only">Cast weight per metal</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>Metal</th>
                  <th scope="col" className={th}>Density</th>
                  <th scope="col" className={th}>Cast weight</th>
                  <th scope="col" className={th}>With post</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.metal} className={r.metal === "18K" ? "font-medium" : undefined}>
                    <th scope="row" className="py-[var(--s-2)] pr-3 text-left font-medium">{r.metal}</th>
                    <td className={`${td} text-muted-foreground`}>{r.density} g/cm³</td>
                    <td className={td}>{weightWord(r.cast)} g</td>
                    <td className={td}>{weightWord(r.withPost)} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          18K = weight + casting allowance; other metals = that ÷ 14 × the metal&apos;s density. Without lock or chain is the cast weight column.
        </p>
      </CardBody>
    </Card>
  );
}

export interface Row extends StoneLine {
  id: number;
}

const firstSize = (chart: ChartName, shape: string) => CHARTS[chart].shapes.find((s) => s.shape === shape)?.sizes[0]?.[0] ?? "";

export function newRow(id: number, chart: ChartName = "size"): Row {
  const shape = CHARTS[chart].shapes[0]!.shape;
  return { id, chart, shape, size: firstSize(chart, shape), pcs: 1 };
}

function DiamondCard() {
  const [rows, setRows] = useState<Row[]>([newRow(1)]);
  const [next, setNext] = useState(2);
  const totals = useMemo(() => stoneTotals(rows), [rows]);
  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Card as="section" aria-labelledby="diamond-title">
      <CardHeader>
        <CardTitle id="diamond-title">Diamond weight</CardTitle>
        <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
          {totals.pcs} stones · {weightWord(totals.ct, 3)} ct · {weightWord(totals.grams, 3)} g
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <StoneRow
              key={r.id}
              n={i + 1}
              row={r}
              totalCt={totals.lines[i]?.totalCt ?? 0}
              onChange={(patch) => update(r.id, patch)}
              onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((x) => x.id !== r.id)) : undefined}
            />
          ))}
        </ol>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setRows((rs) => [...rs, newRow(next, rs.at(-1)?.chart)]);
            setNext((n) => n + 1);
          }}
        >
          <Plus aria-hidden /> Add stones
        </Button>

        {totals.byShape.length > 0 && (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Total by shape">
            <table className="w-full min-w-[20rem] text-[length:var(--fs-3)]">
              <caption className="sr-only">Total by shape</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>Shape</th>
                  <th scope="col" className={th}>Stones</th>
                  <th scope="col" className={th}>Carat</th>
                  <th scope="col" className={th}>Grams</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {totals.byShape.map((s) => (
                  <tr key={s.shape}>
                    <th scope="row" className="py-[var(--s-2)] pr-3 text-left font-medium">{s.shape}</th>
                    <td className={td}>{s.pcs}</td>
                    <td className={td}>{weightWord(s.ct, 3)} ct</td>
                    <td className={td}>{weightWord(s.grams, 3)} g</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <th scope="row" className="py-[var(--s-2)] pr-3 text-left">Total</th>
                  <td className={td}>{totals.pcs}</td>
                  <td className={td}>{weightWord(totals.ct, 3)} ct</td>
                  <td className={td}>{weightWord(totals.grams, 3)} g</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          Carat per stone from the size chart (side and melee stones) or the Boone &amp; Sons chart (centre stones). Grams = carat × 0.2.
        </p>
      </CardBody>
    </Card>
  );
}

export function StoneRow({
  n,
  row,
  totalCt,
  onChange,
  onRemove,
}: {
  n: number;
  row: Row;
  totalCt: number;
  onChange: (patch: Partial<Row>) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const shapes = CHARTS[row.chart].shapes;
  const sizes = shapes.find((s) => s.shape === row.shape)?.sizes ?? [];
  return (
    <li className="grid grid-cols-2 items-end gap-2 border-b border-border pb-3 last:border-b-0 sm:grid-cols-[1.1fr_1fr_1fr_5rem_auto]">
      <Field label={`Chart · line ${n}`} htmlFor={`${id}-c`}>
        <Select
          id={`${id}-c`}
          value={row.chart}
          onChange={(e) => {
            const chart = e.target.value as ChartName;
            const shape = CHARTS[chart].shapes[0]!.shape;
            onChange({ chart, shape, size: firstSize(chart, shape) });
          }}
        >
          <option value="size">Side / melee</option>
          <option value="centre">Centre stone</option>
        </Select>
      </Field>
      <Field label="Shape" htmlFor={`${id}-s`}>
        <Select id={`${id}-s`} value={row.shape} onChange={(e) => onChange({ shape: e.target.value, size: firstSize(row.chart, e.target.value) })}>
          {shapes.map((s) => (
            <option key={s.shape} value={s.shape}>
              {s.shape}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Size (mm)" htmlFor={`${id}-z`}>
        <Select id={`${id}-z`} value={row.size} onChange={(e) => onChange({ size: e.target.value })}>
          {sizes.map(([mm, ct]) => (
            <option key={mm} value={mm}>
              {mm} · {ct} ct
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Pieces" htmlFor={`${id}-p`}>
        <Input
          id={`${id}-p`}
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={Number.isFinite(row.pcs) ? row.pcs : ""}
          onChange={(e) => onChange({ pcs: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
        />
      </Field>
      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:h-[var(--ctl)]">
        <span className="tabular whitespace-nowrap text-[length:var(--fs-2)]">{weightWord(totalCt, 3)} ct</span>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove line ${n}`}>
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}
