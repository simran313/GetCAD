"use client";

import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  briefName,
  estimateMct,
  formatCarat,
  gradeBrief,
  micronsToMm,
  mmToMicrons,
  type BriefGap,
  type OrderSpecInput,
} from "@/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox, Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TONE_TEXT } from "@/lib/tone";
import { cn } from "@/lib/utils";

import { saveBriefAction } from "./actions";
import { Photos } from "./Photos";
import type { ReferenceImage } from "./ReferenceSection";
import { refusalReason } from "@/lib/refusal";

/**
 * The brief, as a form.
 *
 * TWO DECISIONS WORTH KNOWING ABOUT.
 *
 * First, it is ONE form element across all the steps, with the inactive steps
 * hidden rather than unmounted. Stepping is a reading aid, not a submission
 * boundary — so the whole brief posts at once, "back" costs nothing, and a
 * field answered on step 2 cannot be silently dropped because the user never
 * returned to it. It also means the form works with JavaScript off, which is
 * not a hypothetical on a phone with a bad connection.
 *
 * Second, the quality panel grades as you type, and grades ambiguity rather
 * than completeness. "Every field is filled" and "a designer can build this"
 * are different claims, and only the second one is worth telling somebody.
 */
const PRODUCTS = ["RING", "BAND", "PENDANT", "EARRING", "BRACELET", "BANGLE", "NECKLACE", "OTHER"];
const SHAPES = [
  "ROUND", "OVAL", "CUSHION", "PRINCESS", "EMERALD", "PEAR", "MARQUISE",
  "RADIANT", "ASSCHER", "HEART", "TRILLION", "BAGUETTE", "OTHER",
];
const SETTINGS = ["PRONG_4", "PRONG_6", "BEZEL", "HALO", "PAVE", "CHANNEL", "TENSION", "FLUSH", "OTHER"];
const METALS = ["YELLOW", "WHITE", "ROSE", "TWO_TONE", "TRI_COLOUR", "PLATINUM", "SILVER"];
const PURPOSES: Array<[string, string]> = [
  ["CASTING", "Casting"],
  ["DIRECT_PRINT", "Direct print"],
  ["RENDER_ONLY", "Images only"],
];
const FORMATS = ["THREE_DM", "STL", "BOTH", "STEP"];
const FINISHES = ["HIGH_POLISH", "MATTE", "BRUSHED", "HAMMERED", "MIXED"];
const SUPPLY = ["NONE", "CLIENT", "DESIGNER", "PLATFORM"];

const label = (v: string) =>
  v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * Millimetres as typed -> microns as stored. Module-level rather than a closure
 * over `form`, so the memos below depend on the form object itself and nothing
 * that is re-created on every render.
 */
function micronsFrom(form: Record<string, string>, key: string): number | null {
  const raw = form[key];
  const value = Number(raw);
  return raw && Number.isFinite(value) && value > 0 ? mmToMicrons(value) : null;
}

export interface AccentRow {
  shape: string;
  widthMm: string;
  quantity: string;
  setting: string;
}

export interface BriefDefaults extends Partial<OrderSpecInput> {
  accents?: AccentRow[];
  ringSize?: string | null;
  innerCircumferenceUm?: number | null;
  innerDiameterUm?: number | null;
  lengthUm?: number | null;
  renderViews?: number | null;
  notes?: string | null;
}

/**
 * The sections (docs/design N1–N4, N7). On a desk they are one page; on a
 * phone they are steps. A render order (N7) asks for views instead of stones
 * and size.
 */
const CAD_STEPS = ["The piece", "Stones", "Size", "Metal & finish"];
const RENDER_STEPS = ["The piece", "Views", "Metal & finish"];

/** Which size a product is made to (DECISIONS §11 minimum). */
function sizeKind(product: string): "ring" | "wrist" | "length" | "none" {
  if (product === "RING" || product === "BAND") return "ring";
  if (product === "BANGLE" || product === "BRACELET") return "wrist";
  if (product === "NECKLACE") return "length";
  return "none";
}

export function BriefWizard({
  orderId,
  defaults,
  service = "cad",
  readOnly = false,
  images = [],
  lastRingSize = null,
  initialStep = 0,
}: {
  orderId: string;
  defaults: BriefDefaults;
  /** cad, render or cad_render (0035); render briefs skip stones and size. */
  service?: string;
  /** True once the order has been quoted — the brief is frozen from then on. */
  readOnly?: boolean;
  /** The reference photos, shown inside the first step. */
  images?: ReferenceImage[];
  /** The client's last ring size, as a hint for the size system they use. */
  lastRingSize?: string | null;
  /** Opened from a row on Review: start on that row's step. */
  initialStep?: number;
}) {
  const referenceImageCount = images.length;
  const pinnedImageCount = images.filter((i) => i.pins.length > 0).length;
  const isRender = service === "render";
  const STEPS = isRender ? RENDER_STEPS : CAD_STEPS;
  const [step, setStep] = useState(() => Math.min(Math.max(0, initialStep), (service === "render" ? RENDER_STEPS : CAD_STEPS).length - 1));
  const [form, setForm] = useState<Record<string, string>>({
    reference_name: defaults.referenceName ?? "",
    product: defaults.product ?? "RING",
    metal: defaults.metal ?? "YELLOW",
    karatage: defaults.karatage ?? "18K",
    purpose: defaults.purpose ?? "CASTING",
    format: defaults.format ?? "BOTH",
    finish: defaults.finish ?? "HIGH_POLISH",
    centre_shape: defaults.centreShape ?? "ROUND",
    centre_setting: defaults.centreSetting ?? "PRONG_6",
    centre_quantity: String(defaults.centreQuantity ?? 1),
    centre_length_mm: defaults.centreLengthUm ? String(micronsToMm(defaults.centreLengthUm)) : "",
    centre_width_mm: defaults.centreWidthUm ? String(micronsToMm(defaults.centreWidthUm)) : "",
    centre_depth_mm: defaults.centreDepthUm ? String(micronsToMm(defaults.centreDepthUm)) : "",
    stones_supplied_by: "NONE",
    component_count: "1",
    render_views: String(defaults.renderViews ?? (isRender ? 5 : 0)),
    priority: "STANDARD",
    notes: defaults.notes ?? "",
    ring_size: defaults.ringSize ?? "",
    inner_circumference_mm: defaults.innerCircumferenceUm ? String(micronsToMm(defaults.innerCircumferenceUm)) : "",
    inner_diameter_mm: defaults.innerDiameterUm ? String(micronsToMm(defaults.innerDiameterUm)) : "",
    length_mm: defaults.lengthUm ? String(micronsToMm(defaults.lengthUm)) : "",
  });
  const [hasCentre, setHasCentre] = useState(defaults.hasCentreStone ?? false);
  const [certified, setCertified] = useState(false);
  const [accents, setAccents] = useState<AccentRow[]>(defaults.accents ?? []);
  // Named for the client until they name it: "Ring · 18K yellow".
  const [named, setNamed] = useState(!!defaults.referenceName);
  const autoName = briefName({ product: form.product, karatage: form.karatage, metal: form.metal });
  const name = named ? (form.reference_name ?? "") : autoName;

  // Saved as you go: no "Save draft". The whole form posts, as it always did.
  const formRef = useRef<HTMLFormElement>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveRefusal, setSaveRefusal] = useState<string | null>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (readOnly) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      if (!formRef.current) return;
      const data = new FormData(formRef.current);
      data.delete("intent");
      try {
        await saveBriefAction(data);
        setSaveState("saved");
        setSaveRefusal(null);
      } catch (e) {
        setSaveState("error");
        setSaveRefusal(refusalReason(e));
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [form, hasCentre, certified, accents, named, readOnly]);

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const mm = (key: string) => micronsFrom(form, key);

  // Graded on every keystroke. Cheap — it is pure arithmetic over one object.
  const quality = useMemo(() => {
    const spec: OrderSpecInput = {
      referenceName: form.reference_name ?? "",
      product: form.product ?? "",
      metal: form.metal ?? "",
      karatage: form.karatage ?? "",
      purpose: form.purpose ?? "",
      format: form.format ?? "",
      finish: form.finish ?? "",
      hasCentreStone: hasCentre,
      centreShape: hasCentre ? form.centre_shape : null,
      centreSetting: hasCentre ? form.centre_setting : null,
      centreQuantity: hasCentre ? Number(form.centre_quantity) || 0 : 0,
      centreLengthUm: hasCentre ? micronsFrom(form, "centre_length_mm") : null,
      centreWidthUm: hasCentre ? micronsFrom(form, "centre_width_mm") : null,
      centreDepthUm: hasCentre ? micronsFrom(form, "centre_depth_mm") : null,
      centreCertified: certified,
    };
    return gradeBrief(spec, {
      accentRowCount: accents.length,
      referenceImageCount,
      pinnedImageCount,
      service,
      size: {
        ringSize: form.ring_size,
        innerCircumferenceUm: micronsFrom(form, "inner_circumference_mm"),
        innerDiameterUm: micronsFrom(form, "inner_diameter_mm"),
        lengthUm: micronsFrom(form, "length_mm"),
      },
    });
  }, [form, hasCentre, certified, accents.length, referenceImageCount, pinnedImageCount, service]);

  // "Answer whichever you have, we work out the other" — shown, never stored,
  // so it can never overwrite a certified stone's real weight.
  const estimatedCarat = useMemo(() => {
    if (!hasCentre) return null;
    const mct = estimateMct(
      form.centre_shape ?? "",
      micronsFrom(form, "centre_length_mm"),
      micronsFrom(form, "centre_width_mm"),
      micronsFrom(form, "centre_depth_mm"),
    );
    return mct === null ? null : formatCarat(mct);
  }, [form, hasCentre]);

  // A gap's chip takes you to it: its step, then the field (photos by id).
  const jump = (field: string) => {
    setStep(Math.min(stepForField(field), STEPS.length - 1));
    const target = field === "references" ? "photos" : field === "size" ? "ring_size" : field;
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  if (readOnly) {
    return (
      <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-5)]">
        <p className="text-[length:var(--fs-3)] text-muted-foreground">Fixed once priced.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={saveBriefAction}>
      <input type="hidden" name="order_id" value={orderId} />
      {/* Millimetres are what people type; microns are what the database
          stores. Converted once, here, at the boundary. */}
      <input type="hidden" name="centre_length_um" value={mm("centre_length_mm") ?? ""} />
      <input type="hidden" name="centre_width_um" value={mm("centre_width_mm") ?? ""} />
      <input type="hidden" name="centre_depth_um" value={mm("centre_depth_mm") ?? ""} />
      <input type="hidden" name="inner_circumference_um" value={mm("inner_circumference_mm") ?? ""} />
      <input type="hidden" name="inner_diameter_um" value={mm("inner_diameter_mm") ?? ""} />
      <input type="hidden" name="length_um" value={mm("length_mm") ?? ""} />

      <StepBar step={step} steps={STEPS} onPick={setStep} />
      <QualityChip quality={quality} onJump={jump} />

      <Pane show={step === 0} title={STEPS[0]!}>
        <Field id="reference_name" label="Name this job">
          <Input
            id="reference_name"
            name="reference_name"
            value={name}
            onChange={(e) => {
              setNamed(true);
              set("reference_name")(e.target.value);
            }}
            className="min-h-[var(--ctl)]"
          />
        </Field>
        <Choice
          name="product"
          legend="What are we modelling?"
          options={PRODUCTS.map((v) => [v, label(v)])}
          value={form.product ?? ""}
          onChange={set("product")}
        />
        <Photos orderId={orderId} images={images} />
      </Pane>

      {isRender ? (
        <Pane show={step === 1} title="Views">
          <input type="hidden" name="has_centre_stone" value="" />
          <Choice
            name="render_views"
            legend="Views"
            options={[
              ["3", "3 views"],
              ["5", "5 views"],
              ["8", "5 views + close-ups"],
            ]}
            value={form.render_views ?? "5"}
            onChange={set("render_views")}
          />
        </Pane>
      ) : null}

      <Pane show={!isRender && step === 1} title="Stones" hidden={isRender}>
        <Toggle
          name="has_centre_stone"
          checked={hasCentre}
          onChange={setHasCentre}
          label="Centre stone"
        />

        {hasCentre ? (
          <>
            <Choice
              name="centre_shape"
              legend="Shape"
              options={SHAPES.map((v) => [v, label(v)])}
              value={form.centre_shape ?? ""}
              onChange={set("centre_shape")}
            />

            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["centre_length_mm", "centre_width_mm", "centre_depth_mm"] as const).map((k, i) => (
                <Field key={k} id={k} label={["Length", "Width", "Depth"][i] + " (mm)"}>
                  <Input
                    id={k}
                    inputMode="decimal"
                    value={form[k]}
                    onChange={(e) => set(k)(e.target.value)}
                    placeholder="6.50"
                    className="min-h-[var(--ctl)]"
                  />
                </Field>
              ))}
            </div>

            {estimatedCarat ? (
              <p className="mt-2 text-[length:var(--fs-2)] text-muted-foreground">
                ≈ <span className="tabular font-medium">{estimatedCarat}</span>
              </p>
            ) : null}

            <Toggle
              name="centre_certified"
              checked={certified}
              onChange={setCertified}
              label="Certified stone"
            />

            <Field id="centre_quantity" label="Quantity">
              <Input
                id="centre_quantity"
                name="centre_quantity"
                inputMode="numeric"
                value={form.centre_quantity}
                onChange={(e) => set("centre_quantity")(e.target.value)}
                className="min-h-[var(--ctl)]"
              />
            </Field>

            <Choice
              name="centre_setting"
              legend="Setting"
              options={SETTINGS.map((v) => [v, label(v)])}
              value={form.centre_setting ?? ""}
              onChange={set("centre_setting")}
            />
          </>
        ) : null}

        <h3 id="accent_shape" className="mt-8 scroll-mt-24 text-[length:var(--fs-4)] font-medium">Accent stones</h3>

        {accents.map((row, i) => (
          <div
            key={i}
            className="mt-3 rounded-[var(--r-md)] border border-border p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--fs-2)] text-muted-foreground">
                Row {i + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAccents((a) => a.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
            <input type="hidden" name="accent_shape" value={row.shape} />
            <input type="hidden" name="accent_setting" value={row.setting} />
            <input
              type="hidden"
              name="accent_width_um"
              value={row.widthMm ? mmToMicrons(Number(row.widthMm) || 0) : 0}
            />
            <input type="hidden" name="accent_quantity" value={Number(row.quantity) || 0} />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <SelectField
                label="Shape"
                options={SHAPES.map((v) => [v, label(v)])}
                value={row.shape}
                onChange={(v) => updateAccent(setAccents, i, { shape: v })}
              />
              <SelectField
                label="Setting"
                options={SETTINGS.map((v) => [v, label(v)])}
                value={row.setting}
                onChange={(v) => updateAccent(setAccents, i, { setting: v })}
              />
              <Field id={`aw${i}`} label="Width (mm)">
                <Input
                  id={`aw${i}`}
                  inputMode="decimal"
                  value={row.widthMm}
                  onChange={(e) => updateAccent(setAccents, i, { widthMm: e.target.value })}
                  placeholder="1.30"
                  className="min-h-[var(--ctl)]"
                />
              </Field>
              <Field id={`aq${i}`} label="How many">
                <Input
                  id={`aq${i}`}
                  inputMode="numeric"
                  value={row.quantity}
                  onChange={(e) => updateAccent(setAccents, i, { quantity: e.target.value })}
                  placeholder="18"
                  className="min-h-[var(--ctl)]"
                />
              </Field>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-[var(--ctl)] w-full"
          onClick={() =>
            setAccents((a) => [
              ...a,
              { shape: "ROUND", widthMm: "", quantity: "", setting: "PAVE" },
            ])
          }
        >
          {accents.length === 0 ? "Add accent stones" : "Another size"}
        </Button>

        <Choice
          name="stones_supplied_by"
          legend="Stones supplied by"
          options={SUPPLY.map((v) => [v, v === "NONE" ? "No stones" : label(v)])}
          value={form.stones_supplied_by ?? ""}
          onChange={set("stones_supplied_by")}
        />
      </Pane>

      <Pane show={!isRender && step === 2} title="Size" hidden={isRender}>
        {sizeKind(form.product ?? "") === "ring" && (
          <>
            <Field id="ring_size" label="Ring size">
              <Input
                id="ring_size"
                name="ring_size"
                value={form.ring_size}
                onChange={(e) => set("ring_size")(e.target.value)}
                placeholder={lastRingSize || "US 6.5"}
                className="min-h-[var(--ctl)]"
              />
            </Field>
            <Field id="inner_circumference_mm" label="Or inner circumference (mm)">
              <Input
                id="inner_circumference_mm"
                inputMode="decimal"
                value={form.inner_circumference_mm}
                onChange={(e) => set("inner_circumference_mm")(e.target.value)}
                placeholder="53.1"
                className="min-h-[var(--ctl)]"
              />
            </Field>
          </>
        )}
        {sizeKind(form.product ?? "") === "wrist" && (
          <div className="grid grid-cols-2 gap-2">
            <Field id="inner_diameter_mm" label="Inner diameter (mm)">
              <Input
                id="inner_diameter_mm"
                inputMode="decimal"
                value={form.inner_diameter_mm}
                onChange={(e) => set("inner_diameter_mm")(e.target.value)}
                placeholder="62"
                className="min-h-[var(--ctl)]"
              />
            </Field>
            <Field id="length_mm" label="Or length (mm)">
              <Input
                id="length_mm"
                inputMode="decimal"
                value={form.length_mm}
                onChange={(e) => set("length_mm")(e.target.value)}
                placeholder="180"
                className="min-h-[var(--ctl)]"
              />
            </Field>
          </div>
        )}
        {sizeKind(form.product ?? "") === "length" && (
          <Field id="length_mm" label="Length (mm)">
            <Input
              id="length_mm"
              inputMode="decimal"
              value={form.length_mm}
              onChange={(e) => set("length_mm")(e.target.value)}
              placeholder="450"
              className="min-h-[var(--ctl)]"
            />
          </Field>
        )}
        {sizeKind(form.product ?? "") === "none" && (
          <p className="mt-3 text-[length:var(--fs-3)] text-muted-foreground">No size needed.</p>
        )}
      </Pane>

      <Pane show={step === STEPS.length - 1} title="Metal & finish">
        <Choice
          name="metal"
          legend="Metal"
          options={METALS.map((v) => [v, label(v)])}
          value={form.metal ?? ""}
          onChange={set("metal")}
        />

        <Field id="karatage" label="Karat">
          <Input
            id="karatage"
            name="karatage"
            value={form.karatage}
            onChange={(e) => set("karatage")(e.target.value)}
            placeholder="18K"
            className="min-h-[var(--ctl)]"
          />
        </Field>

        {isRender ? (
          <>
            <input type="hidden" name="purpose" value="RENDER_ONLY" />
            <input type="hidden" name="format" value={form.format} />
          </>
        ) : (
        <>
        <Choice
          name="purpose"
          legend="Made for"
          options={PURPOSES}
          value={form.purpose ?? ""}
          onChange={set("purpose")}
        />

        <Choice
          name="format"
          legend="Files"
          options={FORMATS.map((v) => [v, v === "THREE_DM" ? "3DM" : label(v)])}
          value={form.format ?? ""}
          onChange={set("format")}
        />
        </>
        )}

        <Choice
          name="finish"
          legend="Finish"
          options={FINISHES.map((v) => [v, label(v)])}
          value={form.finish ?? ""}
          onChange={set("finish")}
        />

        {/* No priority choice: rush is off until it is defined (DECISIONS §12),
            and upsert_order_spec refuses anything but STANDARD while it is. */}

        <Field id="notes" label="Notes">
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Two-tone parts, stone layout, anything else"
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
          />
        </Field>

        <input type="hidden" name="component_count" value={form.component_count} />
        {!isRender && <input type="hidden" name="render_views" value={form.render_views} />}
      </Pane>

      <div className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-[var(--s-4)] mt-6 flex items-center gap-2 border-t border-border bg-background/95 px-[var(--s-4)] py-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <button
          type="button"
          aria-label="Back"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="inline-flex h-[var(--ctl)] w-[var(--ctl)] shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--border-strong)] disabled:opacity-40 md:hidden"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <SaveState state={saveState} reason={saveRefusal} />
        {step < STEPS.length - 1 ? (
          <Button type="button" className="min-h-[var(--ctl)] flex-1 md:hidden" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Next
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="review"
          className={cn("min-h-[var(--ctl)] flex-1 md:ml-auto md:flex-none", step !== STEPS.length - 1 && "hidden md:inline-flex")}
        >
          Review
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ subcomponents */

function updateAccent(
  setAccents: React.Dispatch<React.SetStateAction<AccentRow[]>>,
  index: number,
  patch: Partial<AccentRow>,
) {
  setAccents((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
}

/** Which step to jump to when someone taps a gap in the quality panel. */
function stepForField(field: string): number {
  if (field === "referenceName" || field === "product" || field === "references") return 0;
  if (field.startsWith("centre")) return 1;
  if (field === "size") return 2;
  return 3;
}

function StepBar({ step, steps: STEPS, onPick }: { step: number; steps: string[]; onPick: (n: number) => void }) {
  return (
    <div className="mb-5 md:hidden">
      <p className="text-[length:var(--fs-2)] text-muted-foreground">
        Step {step + 1} of {STEPS.length}
      </p>
      <h2 className="mt-0.5 text-[length:var(--fs-5)] font-semibold leading-[var(--lh-5)] tracking-[var(--ls-5)]">
        {STEPS[step]}
      </h2>
      <div className="mt-2 flex gap-1" role="tablist" aria-label="Brief steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-label={s}
            onClick={() => onPick(i)}
            className={cn(
              // A 24px tap target around a 4px bar.
              "relative h-6 flex-1 before:absolute before:inset-x-0 before:top-1/2 before:h-1 before:-translate-y-1/2 before:rounded-[var(--r-full)] before:transition-colors before:duration-[var(--dur-fast)]",
              i <= step ? "before:bg-primary" : "before:bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Hidden, not unmounted. Unmounting would drop the inputs from the form, so a
 * field answered on step 2 would silently not be submitted from step 5.
 */
function Pane({
  show,
  title,
  hidden: never = false,
  children,
}: {
  show: boolean;
  title: string;
  /** Not part of this kind of brief at all (e.g. stones on a render order). */
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (never) return null;
  return (
    <section className={cn("md:mb-10 md:border-b md:border-border md:pb-10", show ? "block" : "hidden md:block")}>
      <h2 className="mb-2 hidden font-display text-[length:var(--fs-6)] leading-[var(--lh-6)] md:block">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label: text,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <Label htmlFor={id}>{text}</Label>
      {hint ? (
        <p className="mb-1.5 mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{hint}</p>
      ) : (
        <div className="mb-1.5" />
      )}
      {children}
    </div>
  );
}

/**
 * Radio group rendered as tappable cards.
 *
 * A native dropdown on a phone opens a wheel that hides the question and
 * shows one option at a time — bad wherever the choice carries a consequence
 * the person is supposed to weigh, which here is most of them.
 */
function Choice({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset id={name} className="mt-5 scroll-mt-24">
      <legend className="text-[length:var(--fs-4)] font-medium">{legend}</legend>
      {hint ? (
        <p className="mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map(([v, text]) => (
          <label
            key={v}
            className={cn(
              "flex min-h-[var(--ctl)] cursor-pointer items-center rounded-[var(--r-sm)] border px-3 py-2",
              "text-[length:var(--fs-3)] transition-colors duration-[var(--dur-fast)]",
              value === v
                ? "border-primary bg-primary font-medium text-primary-foreground"
                : "border-border hover:bg-accent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SelectField({
  label: text,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-4">
      <Label>{text}</Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5"
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Toggle({
  name,
  checked,
  onChange,
  label: text,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label id={name} className="mt-5 flex min-h-[var(--ctl)] scroll-mt-24 cursor-pointer items-start gap-3">
      <Checkbox
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="text-[length:var(--fs-4)] font-medium">{text}</span>
        {hint ? (
          <span className="mt-0.5 block text-[length:var(--fs-2)] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * The brief's quality, compressed (redesign): a thin meter and one chip. The
 * chip names the first thing still needed (required first, then anything a
 * designer would have to guess) and takes you to it. Same grading as before;
 * since 10a it applies review's minimum, so it never reads "Ready" while
 * review would refuse the brief.
 */
function QualityChip({ quality, onJump }: { quality: ReturnType<typeof gradeBrief>; onJump: (field: string) => void }) {
  // Earliest step first: on step 1 the chip asks for the photo, not the size.
  const byStep = (a: BriefGap, b: BriefGap) => stepForField(a.field) - stepForField(b.field);
  const blocking = quality.gaps.filter((g) => g.severity === "blocking").sort(byStep);
  const first: BriefGap | undefined = blocking[0] ?? [...quality.gaps].sort(byStep)[0];
  const count = blocking.length || quality.gaps.length;
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-[var(--r-full)] bg-muted" role="meter" aria-label="Brief quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quality.score}>
        <div
          className={cn("h-full transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]", blocking.length ? "bg-[color:var(--tone-danger-fg)]" : "bg-primary")}
          style={{ width: `${quality.score}%` }}
        />
      </div>
      {first ? (
        <button
          type="button"
          onClick={() => onJump(first.field)}
          className={cn(
            "inline-flex min-h-[var(--ctl-sm)] max-w-[70%] items-center gap-1 truncate rounded-[var(--r-full)] border px-3 text-[length:var(--fs-2)] font-medium",
            blocking.length ? "border-[color:var(--tone-danger-fg)] text-[color:var(--tone-danger-fg)]" : "border-border text-muted-foreground",
          )}
        >
          <span className="truncate">
            {count} {blocking.length ? "missing" : "to check"}: {first.what.charAt(0).toLowerCase() + first.what.slice(1)}
          </span>
        </button>
      ) : (
        <span className={cn("inline-flex items-center gap-1 text-[length:var(--fs-2)] font-medium", TONE_TEXT.success)}>
          <Check className="h-4 w-4" aria-hidden /> Ready
        </span>
      )}
    </div>
  );
}

function SaveState({ state, reason }: { state: "idle" | "saving" | "saved" | "error"; reason?: string | null }) {
  return (
    <span className="min-w-0 shrink text-[length:var(--fs-2)] text-muted-foreground" aria-live="polite">
      {state === "saving" ? (
        <Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-label="Saving" />
      ) : state === "saved" ? (
        "Saved"
      ) : state === "error" ? (
        <span className="text-[color:var(--tone-danger-fg)]">{reason ? `Not saved: ${reason}` : "Not saved"}</span>
      ) : null}
    </span>
  );
}
