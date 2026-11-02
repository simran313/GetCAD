"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { castWeights, stoneTotals, toSavedStones, weightWord, type SavedStone } from "@/core/tools/calculators";

import { newRow, StoneRow, type Row } from "../tools/Calculators";
import { saveWeightsAction } from "../orders/fileActions";

/**
 * The version's gold weight and diamonds (Phase 13f, owner 2 Nov 2026): the
 * calculators, saved with the job. On save the server joins them under the
 * technical image, so the image the client and QC see carries them.
 */
export interface SavedWeights {
  gold_18k_g: number | null;
  casting_allowance_g: number;
  post_allowance_g: number;
  stones: SavedStone[];
  updated_at: string | null;
  tech_source_id: string | null;
  tech_current_id: string | null;
  previous: { version: number; gold_18k_g: number; stones: SavedStone[] } | null;
}

const toRows = (stones: SavedStone[]): Row[] => stones.map((s, i) => ({ id: i + 1, chart: s.chart, shape: s.shape, size: s.size, pcs: s.pcs }));

export function WeightsCard({ orderId, saved, volumeMm3, editable }: { orderId: string; saved: SavedWeights; volumeMm3: number | null; editable: boolean }) {
  // Start from this version's saved weights, else the previous version's, else the model volume at 14 g/cm³.
  const startStones = saved.gold_18k_g != null ? saved.stones : (saved.previous?.stones ?? []);
  const startGold =
    saved.gold_18k_g ?? saved.previous?.gold_18k_g ?? (volumeMm3 != null ? Number(((volumeMm3 / 1000) * 14).toFixed(2)) : null);
  const [gold, setGold] = useState(startGold != null ? String(startGold) : "");
  const [casting, setCasting] = useState(String(saved.casting_allowance_g));
  const [post, setPost] = useState(String(saved.post_allowance_g));
  const [rows, setRows] = useState<Row[]>(startStones.length ? toRows(startStones) : []);
  const [next, setNext] = useState(startStones.length + 1);
  const totals = useMemo(() => stoneTotals(rows), [rows]);
  const g18 = castWeights(Number(gold.replace(",", ".")), { casting: Number(casting) || 0, post: Number(post) || 0 }).find((r) => r.metal === "18K");

  const joined = saved.gold_18k_g != null && !!saved.tech_source_id && saved.tech_current_id !== saved.tech_source_id;
  const status =
    saved.gold_18k_g == null
      ? "Not saved yet. Submitting needs them."
      : !saved.tech_current_id
        ? "Saved. Upload the technical image: these are added under it."
        : joined
          ? "Saved and added under the technical image."
          : "Saved, but not yet added to the technical image: upload it again, or save again.";

  return (
    <Card as="section" aria-labelledby="weights-title">
      <CardHeader>
        <CardTitle id="weights-title">Gold weight and diamonds</CardTitle>
        <span className="tabular font-mono text-[length:var(--fs-2)] text-muted-foreground">
          {g18 ? `18K ${weightWord(g18.cast)} g` : "18K —"} · {totals.pcs} stones · {weightWord(totals.ct, 3)} ct
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[length:var(--fs-2)] text-muted-foreground" role="status">
          {status}
          {saved.gold_18k_g == null && saved.previous ? ` Filled in from version ${saved.previous.version}.` : ""}
        </p>
        <form action={saveWeightsAction} className="space-y-4">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="stones" value={JSON.stringify(toSavedStones(rows))} />
          <fieldset disabled={!editable} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="18K cast weight (g) · this job" htmlFor="w-gold" hint={volumeMm3 != null ? `Model volume ${Number(volumeMm3).toFixed(1)} mm³ ≈ ${((volumeMm3 / 1000) * 14).toFixed(2)} g` : undefined}>
                <Input id="w-gold" name="gold_18k_g" type="number" inputMode="decimal" min="0.001" step="0.001" required value={gold} onChange={(e) => setGold(e.target.value)} />
              </Field>
              <Field label="Casting allowance (g)" htmlFor="w-casting">
                <Input id="w-casting" name="casting_allowance_g" type="number" inputMode="decimal" min="0" step="0.01" required value={casting} onChange={(e) => setCasting(e.target.value)} />
              </Field>
              <Field label="Post allowance (g)" htmlFor="w-post">
                <Input id="w-post" name="post_allowance_g" type="number" inputMode="decimal" min="0" step="0.01" required value={post} onChange={(e) => setPost(e.target.value)} />
              </Field>
            </div>
            {rows.length > 0 && (
              <ol className="space-y-3">
                {rows.map((r, i) => (
                  <StoneRow
                    key={r.id}
                    n={i + 1}
                    row={r}
                    totalCt={totals.lines[i]?.totalCt ?? 0}
                    onChange={(patch) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                    onRemove={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  />
                ))}
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRows((rs) => [...rs, newRow(next, rs.at(-1)?.chart)]);
                  setNext((n) => n + 1);
                }}
              >
                <Plus aria-hidden /> Add diamonds
              </Button>
              <Button type="submit" size="sm" className="ml-auto">
                Save weights
              </Button>
            </div>
          </fieldset>
        </form>
        <p className="text-[length:var(--fs-2)] text-muted-foreground">
          The technical image gets a panel underneath with the cast weight in every metal and these diamonds (carat per stone from the size charts). No diamonds? Save with no lines.
        </p>
      </CardBody>
    </Card>
  );
}
