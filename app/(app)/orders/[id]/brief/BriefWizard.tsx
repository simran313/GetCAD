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
import { Certificates } from "./Certificates";
import type { CertificateView } from "@/lib/client/standingActions";
import type { ReferenceImage } from "./ReferenceSection";
import { refusalReason } from "@/lib/refusal";
import { countryForSystem, formatRingSize, MAIN_RING_COUNTRIES, parseRingSize, RING_COUNTRIES, ringCircumferenceMm, ringCountry, ringSystem } from "@/core/sizes/ringSizes";
import { briefStepGaps, firstIncompleteStep, type StepGap } from "@/core/orders/briefSteps";

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
/** "As per reference image" (owner, 7 Nov 2026): a shape and a setting for the centre and side stones (0064). */
const REFERENCE = "AS_PER_REFERENCE";
/** Where the client last chose their country on this device (the brief stores only the size system). */
const COUNTRY_KEY = "tcp_ring_country";
const METALS = ["YELLOW", "WHITE", "ROSE", "TWO_TONE", "TRI_COLOUR", "PLATINUM", "SILVER"];

/** Karats offered for each metal (a value saved before stays offered). */
const GOLD_KARATS = ["9K", "10K", "14K", "18K", "22K"];
function karatsFor(metal: string): string[] {
  if (metal === "PLATINUM") return ["PT950", "PT900"];
  if (metal === "SILVER") return ["925"];
  return GOLD_KARATS;
}

/**
 * "Other" piece (owner, 5 Nov 2026): the client says what it is; it is kept
 * as the first line of the notes, "Piece: …", which designers read with the
 * rest of the notes.
 */
const PIECE_PREFIX = "Piece: ";
function splitPiece(notes: string): { piece: string; rest: string } {
  const [first, ...more] = notes.split("\n");
  return first?.startsWith(PIECE_PREFIX) ? { piece: first.slice(PIECE_PREFIX.length), rest: more.join("\n") } : { piece: "", rest: notes };
}
const joinPiece = (piece: string, rest: string) => (piece.trim() ? `${PIECE_PREFIX}${piece.trim()}${rest ? `\n${rest}` : ""}` : rest);

const label = (v: string) =>
  v === REFERENCE ? "As per reference image" : v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

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
  /** No longer asked (0064); a count saved before is kept. */
  quantity: string;
  setting: string;
  /** "Scale to centre stone": the width may be left out (saved as no width, 0064). */
  scale?: boolean;
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
// Three steps (owner, 5 Nov 2026): metal, karat and notes sit with the size.
const CAD_STEPS = ["The piece", "Stones", "Size & metal"];
const RENDER_STEPS = ["The piece", "Views", "Metal & notes"];

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
  certificates = [],
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
  /** Diamond certificate pictures already on the order (0062). */
  certificates?: CertificateView[];
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
    // Asked, not assumed (owner, 7 Nov 2026): no setting until one is chosen.
    centre_setting: defaults.centreSetting ?? "",
    centre_quantity: String(defaults.centreQuantity ?? 1),
    centre_length_mm: defaults.centreLengthUm ? String(micronsToMm(defaults.centreLengthUm)) : "",
    centre_width_mm: defaults.centreWidthUm ? String(micronsToMm(defaults.centreWidthUm)) : "",
    centre_depth_mm: defaults.centreDepthUm ? String(micronsToMm(defaults.centreDepthUm)) : "",
    stones_supplied_by: "NONE",
    component_count: "1",
    render_views: String(defaults.renderViews ?? (isRender ? 5 : 0)),
    priority: "STANDARD",
    notes: splitPiece(defaults.notes ?? "").rest,
    ring_size: defaults.ringSize ?? "",
    inner_circumference_mm: defaults.innerCircumferenceUm ? String(micronsToMm(defaults.innerCircumferenceUm)) : "",
    inner_diameter_mm: defaults.innerDiameterUm ? String(micronsToMm(defaults.innerDiameterUm)) : "",
    length_mm: defaults.lengthUm ? String(micronsToMm(defaults.lengthUm)) : "",
  });
  const [hasCentre, setHasCentre] = useState(defaults.hasCentreStone ?? false);
  const [certified, setCertified] = useState(false);
  const [accents, setAccents] = useState<AccentRow[]>(defaults.accents ?? []);
  // A new brief has no answer about the centre stone yet; the dropdown asks.
  const [centreAnswered, setCentreAnswered] = useState(defaults.hasCentreStone != null);
  // Ring size: the country's system, then a size from its list.
  const savedSize = parseRingSize(defaults.ringSize);
  // No size yet: the country of the client's last ring size, else US.
  const knownSys = defaults.ringSize ? savedSize.code : lastRingSize ? parseRingSize(lastRingSize).code : null;
  const [ringSys, setRingSys] = useState(knownSys ?? "US");
  // The country: none until chosen on a new brief; else this device's last
  // choice if it uses the same system, else the system's first country.
  const [country, setCountry] = useState(() => (knownSys ? countryForSystem(knownSys) : ""));
  useEffect(() => {
    if (!knownSys) return;
    try {
      const mine = window.localStorage.getItem(COUNTRY_KEY);
      if (mine && ringCountry(mine)?.system === knownSys) setCountry(mine);
    } catch {
      /* private mode: the system's first country stands */
    }
  }, [knownSys]);
  const [ringSz, setRingSz] = useState(savedSize.size);
  const [ringOther, setRingOther] = useState<string | null>(savedSize.other);
  const ringSizeText = ringOther ?? formatRingSize(ringSys, ringSz);
  // "Other": what the piece is, kept as the notes' first line.
  const savedNotes = splitPiece(defaults.notes ?? "");
  const [piece, setPiece] = useState(savedNotes.piece);
  const notesText = joinPiece(form.product === "OTHER" ? piece : "", form.notes ?? "");
  // Named for the client until they name it: "Ring · 18K yellow".
  const [named, setNamed] = useState(!!defaults.referenceName);
  const autoName = briefName({ product: form.product, karatage: form.karatage, metal: form.metal });
  const name = named ? (form.reference_name ?? "") : autoName;

  // Saved as you go: no "Save draft". The whole form posts, as it always did.
  const formRef = useRef<HTMLFormElement>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveRefusal, setSaveRefusal] = useState<string | null>(null);
  const firstRender = useRef(true);
  // Read by the autosave below; set once the step rules are worked out.
  const centreIncompleteRef = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (centreIncompleteRef.current) {
      setSaveState("idle");
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
  }, [form, hasCentre, certified, accents, named, readOnly, ringSys, ringSz, ringOther, piece, centreAnswered, country]);

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
        ringSize: ringSizeText,
        innerCircumferenceUm: micronsFrom(form, "inner_circumference_mm"),
        innerDiameterUm: micronsFrom(form, "inner_diameter_mm"),
        lengthUm: micronsFrom(form, "length_mm"),
      },
    });
  }, [form, hasCentre, certified, accents.length, referenceImageCount, pinnedImageCount, service, ringSizeText]);
  const centreGap = !isRender && !centreAnswered;

  // What each step still needs (owner, 7 Nov 2026): Next, the step tabs and
  // Review do not move on past a step with a required answer missing.
  const stepGaps = briefStepGaps({
    service,
    name,
    product: form.product ?? "",
    piece,
    photos: referenceImageCount,
    centreAnswered,
    hasCentre,
    centreShape: form.centre_shape ?? "",
    centreLengthMm: form.centre_length_mm ?? "",
    centreWidthMm: form.centre_width_mm ?? "",
    centreSetting: form.centre_setting ?? "",
    accents: accents.map((a) => ({ shape: a.shape, setting: a.setting, widthMm: a.widthMm, scale: !!a.scale })),
    sizeKind: sizeKind(form.product ?? ""),
    country,
    ringSize: ringOther ?? ringSz,
    innerCircumferenceMm: form.inner_circumference_mm ?? "",
    innerDiameterMm: form.inner_diameter_mm ?? "",
    lengthMm: form.length_mm ?? "",
    metal: form.metal ?? "",
    karat: form.karatage ?? "",
  });
  const firstGapStep = firstIncompleteStep(stepGaps);
  // The gaps are named once someone tries to move on, not while they type.
  const [tried, setTried] = useState(false);
  const gapsHere = stepGaps.filter((g) => g.step === step);
  const showGaps = (gaps: StepGap[]) => {
    setTried(true);
    const first = gaps[0];
    if (!first) return;
    setStep(first.step);
    window.setTimeout(() => document.getElementById(first.field)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };
  const goTo = (target: number) => {
    // Back is always open; forward only as far as the first step still missing something.
    const reachable = firstGapStep === -1 ? STEPS.length - 1 : firstGapStep;
    if (target <= step || target <= reachable) {
      setTried(false);
      setStep(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      showGaps(stepGaps.filter((g) => g.step === reachable));
    }
  };
  // A centre stone with something missing is refused by the database
  // (order_specs_centre_coherent), so it is not sent until it is whole.
  const centreIncomplete = !isRender && hasCentre && stepGaps.some((g) => g.step === 1 && g.field.startsWith("centre_"));
  centreIncompleteRef.current = centreIncomplete;

  // Filled in, on to the next (owner, 5 Nov 2026): after a choice the next
  // field scrolls into view, and an empty text box there takes the cursor.
  const advance = (fromId: string) =>
    window.setTimeout(() => {
      const fields = [...(formRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])].filter((el) => el.offsetParent !== null);
      const next = fields[fields.findIndex((el) => el.dataset.field === fromId) + 1];
      if (!next) {
        document.getElementById("brief-next")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      next.scrollIntoView({ behavior: "smooth", block: "center" });
      const box = next.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]):not([type=file]), textarea");
      if (box && !box.value) box.focus({ preventScroll: true });
    }, 60);
  const enterAdvances = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      advance(id);
    }
  };

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
    const own = stepGaps.find((g) => g.field === field);
    setStep(Math.min(own ? own.step : stepForField(field), STEPS.length - 1));
    const target = field === "references" ? "photos" : field === "size" ? "ring_size" : field;
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  // The chip names what the step rules still need first (the required
  // answers), then what a designer would still have to guess.
  const shownQuality: ReturnType<typeof gradeBrief> = {
    ...quality,
    blockingCount: stepGaps.length,
    gaps: [
      ...stepGaps.map((g) => ({ severity: "blocking" as const, field: g.field, what: g.what, why: "" })),
      ...quality.gaps.filter((g) => g.severity !== "blocking" || g.field === "changeSummary"),
    ],
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

      <input type="hidden" name="ring_size" value={ringSizeText} />
      <input type="hidden" name="notes" value={notesText} />
      {/* On a phone one sticky row: the step and what is still missing, then
          the step tabs. At desk width the meter and chip sit above the form. */}
      <StepBar step={step} steps={STEPS} onPick={goTo} aside={<QualityChip quality={shownQuality} onJump={jump} compact />} />
      <QualityChip quality={shownQuality} onJump={jump} className="max-md:hidden" />

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
            onKeyDown={enterAdvances("reference_name")}
            className="min-h-[var(--ctl)]"
          />
        </Field>
        <SelectField
          id="product"
          name="product"
          label="What are we modelling?"
          options={PRODUCTS.map((v) => [v, label(v)])}
          value={form.product ?? "RING"}
          onChange={(v) => {
            set("product")(v);
            advance("product");
          }}
        />
        {form.product === "OTHER" && (
          <Field id="other_piece" label="What is it?">
            <Input
              id="other_piece"
              value={piece}
              onChange={(e) => setPiece(e.target.value)}
              onKeyDown={enterAdvances("other_piece")}
              placeholder="Brooch, cufflinks, nose pin…"
              className="min-h-[var(--ctl)]"
            />
          </Field>
        )}
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
        <input type="hidden" name="has_centre_stone" value={hasCentre ? "on" : ""} />
        <input type="hidden" name="centre_shape" value={hasCentre ? form.centre_shape : ""} />
        <input type="hidden" name="stones_supplied_by" value={form.stones_supplied_by} />
        <p className="eyebrow mt-1">Stone details</p>
        <SelectField
          id="centre_choice"
          label="Centre stone"
          options={[
            ...(centreAnswered ? [] : ([["", "Choose…"]] as Array<[string, string]>)),
            ["NONE", "No centre stone"],
            [REFERENCE, label(REFERENCE)],
            ...SHAPES.map((v) => [v, label(v)] as [string, string]),
          ]}
          value={centreAnswered ? (hasCentre ? (form.centre_shape ?? "ROUND") : "NONE") : ""}
          onChange={(v) => {
            if (!v) return;
            setCentreAnswered(true);
            setHasCentre(v !== "NONE");
            if (v !== "NONE") set("centre_shape")(v);
            advance("centre_choice");
          }}
        />

        {hasCentre ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(["centre_length_mm", "centre_width_mm", "centre_depth_mm"] as const).map((k, i) => (
                <Field key={k} id={k} label={["Length", "Width", "Depth"][i] + " mm"}>
                  <Input
                    id={k}
                    inputMode="decimal"
                    value={form[k]}
                    onChange={(e) => set(k)(e.target.value)}
                    onKeyDown={enterAdvances(k)}
                    placeholder="6.50"
                    className="min-h-[var(--ctl)]"
                  />
                </Field>
              ))}
            </div>
            {estimatedCarat ? (
              <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">
                ≈ <span className="tabular font-medium">{estimatedCarat}</span>
              </p>
            ) : null}
            {/* One centre stone (owner, 7 Nov 2026: "How many" is gone). */}
            <SelectField
              id="centre_setting"
              name="centre_setting"
              label="Setting"
              options={[
                ...(form.centre_setting ? [] : ([["", "Choose…"]] as Array<[string, string]>)),
                [REFERENCE, label(REFERENCE)],
                ...SETTINGS.map((v) => [v, label(v)] as [string, string]),
              ]}
              value={form.centre_setting ?? ""}
              onChange={(v) => {
                set("centre_setting")(v);
                if (v) advance("centre_setting");
              }}
            />
            <label className="mt-2 flex min-h-[var(--ctl-sm)] cursor-pointer items-center gap-2 text-[length:var(--fs-3)]">
              <Checkbox name="centre_certified" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
              Certified stone
            </label>
            {(certified || certificates.length > 0) && <Certificates orderId={orderId} initial={certificates} readOnly={readOnly} />}
          </>
        ) : null}

        <p id="accent_shape" className="eyebrow mt-5 scroll-mt-24">Side stones (accents)</p>

        {accents.map((row, i) => {
          // Saved only once it says something a designer can use: a width,
          // or "Scale to centre stone" (a row stored without a width means that, 0064).
          const scales = !!row.scale && hasCentre;
          const saved = Number(row.widthMm) > 0 || scales;
          return (
            <div key={i} className="mt-2 rounded-[var(--r-md)] border border-border p-2.5">
              {saved && (
                <>
                  <input type="hidden" name="accent_shape" value={row.shape} />
                  <input type="hidden" name="accent_setting" value={row.setting} />
                  <input type="hidden" name="accent_width_um" value={Number(row.widthMm) > 0 ? mmToMicrons(Number(row.widthMm)) : ""} />
                  <input type="hidden" name="accent_quantity" value={Number(row.quantity) > 0 ? row.quantity : ""} />
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  id={`as${i}`}
                  label="Shape"
                  options={[[REFERENCE, label(REFERENCE)], ...SHAPES.map((v) => [v, label(v)] as [string, string])]}
                  value={row.shape}
                  onChange={(v) => updateAccent(setAccents, i, { shape: v })}
                />
                <SelectField
                  id={`ast${i}`}
                  label="Setting"
                  options={[[REFERENCE, label(REFERENCE)], ...SETTINGS.map((v) => [v, label(v)] as [string, string])]}
                  value={row.setting}
                  onChange={(v) => updateAccent(setAccents, i, { setting: v })}
                />
              </div>
              <Field id={`aw${i}`} label={scales ? "Width mm (optional)" : "Width mm"}>
                <Input
                  id={`aw${i}`}
                  inputMode="decimal"
                  value={row.widthMm}
                  onChange={(e) => updateAccent(setAccents, i, { widthMm: e.target.value })}
                  onKeyDown={enterAdvances(`aw${i}`)}
                  placeholder="1.30"
                  className="min-h-[var(--ctl)]"
                />
              </Field>
              {hasCentre && (
                <label className="mt-2 flex min-h-[var(--ctl-sm)] cursor-pointer items-center gap-2 text-[length:var(--fs-3)]">
                  <Checkbox checked={!!row.scale} onChange={(e) => updateAccent(setAccents, i, { scale: e.target.checked })} />
                  Scale to centre stone
                </label>
              )}
              <button
                type="button"
                className="mt-1 text-[length:var(--fs-2)] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setAccents((a) => a.filter((_, j) => j !== i))}
              >
                Remove this row
              </button>
            </div>
          );
        })}

        {/* Another size is optional: one row per size of side stone. */}
        <Button
          type="button"
          variant="outline"
          className="mt-2 min-h-[var(--ctl)] w-full"
          onClick={() => setAccents((a) => [...a, { shape: REFERENCE, widthMm: "", quantity: "", setting: REFERENCE, scale: false }])}
        >
          {accents.length === 0 ? "Add side stones" : "Another size"}
        </Button>
      </Pane>

      <Pane show={!isRender && step === 2} title="Size" hidden={isRender}>
        {sizeKind(form.product ?? "") === "ring" && (
          <>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
              <SelectField
                id="ring_system"
                label="Country"
                options={[
                  ...(country ? [] : ([["", "Choose…"]] as Array<[string, string]>)),
                  ...MAIN_RING_COUNTRIES.map((c) => [c.name, c.name] as [string, string]),
                  ["—", "──────────"],
                  ...RING_COUNTRIES.slice(MAIN_RING_COUNTRIES.length).map((c) => [c.name, c.name] as [string, string]),
                ]}
                value={country}
                onChange={(v) => {
                  const c = ringCountry(v);
                  if (!c) return;
                  setCountry(c.name);
                  try {
                    window.localStorage.setItem(COUNTRY_KEY, c.name);
                  } catch {
                    /* private mode: not remembered on this device */
                  }
                  if (c.system !== ringSys) {
                    setRingSys(c.system);
                    if (!ringSystem(c.system).sizes.includes(ringSz)) setRingSz("");
                  }
                  setRingOther(null);
                  advance("ring_system");
                }}
              />
              <SelectField
                id="ring_size"
                label="Ring size"
                options={[["", country ? "Choose…" : "Country first"], ...(country ? ringSystem(ringSys).sizes.map((z) => [z, z] as [string, string]) : [])]}
                value={ringOther ? "" : ringSz}
                onChange={(v) => {
                  setRingSz(v);
                  setRingOther(null);
                  if (v) advance("ring_size");
                }}
              />
            </div>
            {ringOther && (
              <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">Saved before as “{ringOther}”. Choose a size to replace it.</p>
            )}
            {(() => {
              // Owner, 7 Nov 2026: the inside diameter comes from the size; the
              // client can enter their own when it is off, and the designer sees both.
              const chartCirc = !ringOther && ringSz ? ringCircumferenceMm(ringSys, ringSz) : null;
              const chartDia = chartCirc != null ? (chartCirc / Math.PI).toFixed(1) : null;
              const own = Number(form.inner_diameter_mm) > 0 || Number(form.inner_circumference_mm) > 0;
              return (
                <>
                  {chartDia && (
                    <p className="mt-2 rounded-[var(--r-md)] bg-muted px-3 py-2 text-[length:var(--fs-3)]" aria-live="polite">
                      Inside <span className="tabular font-mono font-medium">Ø {chartDia} mm</span>
                      <span className="text-muted-foreground"> · {chartCirc!.toFixed(1)} mm around{own ? " (your measurement below is used)" : ""}</span>
                    </p>
                  )}
                  <details className="mt-2" open={own || undefined}>
                    <summary className="w-fit cursor-pointer text-[length:var(--fs-2)] text-muted-foreground underline underline-offset-4">
                      {chartDia ? "Your ring measures differently? Enter it" : "Know the inside measurement instead?"}
                    </summary>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <Field id="inner_diameter_mm" label="Inside diameter (mm)">
                        <Input
                          id="inner_diameter_mm"
                          inputMode="decimal"
                          value={form.inner_diameter_mm}
                          onChange={(e) => set("inner_diameter_mm")(e.target.value)}
                          placeholder={chartDia ?? "17.3"}
                          className="min-h-[var(--ctl)]"
                        />
                      </Field>
                      <Field id="inner_circumference_mm" label="Or around (mm)">
                        <Input
                          id="inner_circumference_mm"
                          inputMode="decimal"
                          value={form.inner_circumference_mm}
                          onChange={(e) => set("inner_circumference_mm")(e.target.value)}
                          placeholder={chartCirc != null ? chartCirc.toFixed(1) : "54.4"}
                          className="min-h-[var(--ctl)]"
                        />
                      </Field>
                    </div>
                    <p className="mt-1 text-[length:var(--fs-2)] text-muted-foreground">The designer works to your measurement and sees the size too.</p>
                  </details>
                </>
              );
            })()}
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

      <Pane show={step === STEPS.length - 1} title="Metal & notes">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
          <SelectField
            id="metal"
            name="metal"
            label="Metal"
            options={METALS.map((v) => [v, label(v)])}
            value={form.metal ?? "YELLOW"}
            onChange={(v) => {
              set("metal")(v);
              if (!karatsFor(v).includes(form.karatage ?? "")) set("karatage")(karatsFor(v)[v === "PLATINUM" || v === "SILVER" ? 0 : 3]!);
              advance("metal");
            }}
          />
          <SelectField
            id="karatage"
            name="karatage"
            label="Karat"
            options={[...new Set([...karatsFor(form.metal ?? "YELLOW"), ...(form.karatage ? [form.karatage] : [])])].map((k) => [k, k])}
            value={form.karatage ?? "18K"}
            onChange={(v) => {
              set("karatage")(v);
              advance("karatage");
            }}
          />
        </div>

        {/* Not asked (owner, 5 Nov 2026): made for, files, finish and who
            supplies the stones keep their saved or standard values. */}
        <input type="hidden" name="purpose" value={isRender ? "RENDER_ONLY" : form.purpose} />
        <input type="hidden" name="format" value={form.format} />
        <input type="hidden" name="finish" value={form.finish} />

        {/* No priority choice: rush is off until it is defined (DECISIONS §12),
            and upsert_order_spec refuses anything but STANDARD while it is. */}

        <Field id="notes" label="Notes">
          <Textarea
            id="notes"
            rows={3}
            placeholder="Two-tone parts, stone layout, anything else"
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
          />
        </Field>

        <input type="hidden" name="component_count" value={form.component_count} />
        {!isRender && <input type="hidden" name="render_views" value={form.render_views} />}
      </Pane>

      {tried && (gapsHere.length > 0 || (stepGaps.length > 0 && step === STEPS.length - 1)) && (
        <div role="alert" className="mt-6 rounded-[var(--r-md)] border border-[color:var(--tone-danger-fg)] p-3 text-[length:var(--fs-3)] text-[color:var(--tone-danger-fg)]">
          <p className="font-medium">To go on, add:</p>
          <ul className="mt-1 list-disc pl-5">
            {(gapsHere.length ? gapsHere : stepGaps).map((g) => (
              <li key={g.field}>
                <button type="button" className="text-left underline underline-offset-4" onClick={() => showGaps([g])}>
                  {g.what}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-[var(--chrome-bottom)] z-10 -mx-[var(--s-4)] mt-6 flex items-center gap-2 border-t border-border bg-background/95 px-[var(--s-4)] py-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <button
          type="button"
          aria-label="Back"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="inline-flex h-[var(--ctl)] w-[var(--ctl)] shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--border-strong)] disabled:opacity-40 md:hidden"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        {centreIncomplete ? (
          <span className="min-w-0 shrink text-[length:var(--fs-2)] text-muted-foreground">Finish the centre stone to save</span>
        ) : (
          <SaveState state={saveState} reason={saveRefusal} />
        )}
        {step < STEPS.length - 1 ? (
          <Button id="brief-next" type="button" className="min-h-[var(--ctl)] flex-1 md:hidden" onClick={() => {
            if (gapsHere.length) return showGaps(gapsHere);
            goTo(step + 1);
          }}>
            Next
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="review"
          onClick={(e) => {
            // Every step complete before Review (at desk width all steps are on one page).
            if (stepGaps.length) {
              e.preventDefault();
              showGaps(stepGaps);
            }
          }}
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
  if (["referenceName", "reference_name", "product", "other_piece", "references", "photos"].includes(field)) return 0;
  if (field.startsWith("centre") || /^(as|ast|aw)\d+$/.test(field) || field.startsWith("accent")) return 1;
  // Size, metal and notes share the last step.
  return 2;
}

function StepBar({ step, steps: STEPS, onPick, aside }: { step: number; steps: string[]; onPick: (n: number) => void; aside?: React.ReactNode }) {
  // One line (the step, and what is still missing) and a thin bar, kept in
  // view under the top bar while scrolling.
  return (
    <div className="sticky top-[var(--chrome-top)] z-20 -mx-[var(--s-4)] mb-3 bg-background/95 px-[var(--s-4)] pb-1 pt-2 backdrop-blur md:hidden">
      <div className="flex min-h-[var(--ctl-sm)] items-center justify-between gap-2">
        <p className="flex shrink-0 items-baseline gap-2 text-[length:var(--fs-3)]">
          <span className="tabular text-muted-foreground">
            {step + 1}/{STEPS.length}
          </span>
          <span className="font-semibold">{STEPS[step]}</span>
        </p>
        {aside}
      </div>
      <div className="mt-1 flex gap-1" role="tablist" aria-label="Brief steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-label={s}
            onClick={() => onPick(i)}
            className={cn(
              // A 24px tap target (WCAG 2.5.8) around a 2px bar.
              "relative h-6 flex-1 before:absolute before:inset-x-0 before:top-1/2 before:h-0.5 before:-translate-y-1/2 before:rounded-[var(--r-full)] before:transition-colors before:duration-[var(--dur-fast)]",
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
    <div className="mt-3 scroll-mt-28" data-field={id}>
      <Label htmlFor={id}>{text}</Label>
      {hint ? (
        <p className="mb-1 mt-0.5 text-[length:var(--fs-2)] text-muted-foreground">{hint}</p>
      ) : (
        <div className="mb-1" />
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

/**
 * A labelled dropdown (owner, 5 Nov 2026: dropdowns instead of rows of
 * buttons, so a question takes one line). With a name it posts with the
 * form; without one its value is posted through a hidden input.
 */
function SelectField({
  id,
  name,
  label: text,
  options,
  value,
  onChange,
}: {
  id: string;
  name?: string;
  label: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3 scroll-mt-28" data-field={id}>
      <Label htmlFor={id}>{text}</Label>
      <Select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1">
        {options.map(([v, t]) => (
          <option key={v} value={v} disabled={(v === "" && value !== "") || v === "—"}>
            {t}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The brief's quality, compressed (redesign): a thin meter and one chip. The
 * chip names the first thing still needed (required first, then anything a
 * designer would have to guess) and takes you to it. Same grading as before;
 * since 10a it applies review's minimum, so it never reads "Ready" while
 * review would refuse the brief.
 */
function QualityChip({
  quality,
  onJump,
  compact = false,
  className,
}: {
  quality: ReturnType<typeof gradeBrief>;
  onJump: (field: string) => void;
  /** On the phone's step row: the chip alone; the step tabs already show progress. */
  compact?: boolean;
  className?: string;
}) {
  // Earliest step first: on step 1 the chip asks for the photo, not the size.
  const byStep = (a: BriefGap, b: BriefGap) => stepForField(a.field) - stepForField(b.field);
  const blocking = quality.gaps.filter((g) => g.severity === "blocking").sort(byStep);
  const first: BriefGap | undefined = blocking[0] ?? [...quality.gaps].sort(byStep)[0];
  const count = blocking.length || quality.gaps.length;
  // "A reference photo" → "a reference photo"; beside the step on a phone,
  // "reference photo", so the whole label fits a 390 px screen.
  const what = first ? first.what.charAt(0).toLowerCase() + first.what.slice(1) : "";
  const label = compact ? what.replace(/^(a|an|the) /, "") : what;
  const chip = first ? (
    <button
      type="button"
      onClick={() => onJump(first.field)}
      className={cn(
        "inline-flex min-h-[var(--ctl-sm)] min-w-0 items-center gap-1 truncate rounded-[var(--r-full)] border text-[length:var(--fs-2)] font-medium",
        // Beside the step on a phone it takes what the row has left.
        compact ? "px-2.5" : "max-w-[70%] px-3",
        blocking.length ? "border-[color:var(--tone-danger-fg)] text-[color:var(--tone-danger-fg)]" : "border-border text-muted-foreground",
      )}
    >
      <span className="truncate">
        {count} {blocking.length ? "missing" : "to check"}: {label}
      </span>
    </button>
  ) : (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[length:var(--fs-2)] font-medium", TONE_TEXT.success)}>
      <Check className="h-4 w-4" aria-hidden /> Ready
    </span>
  );
  if (compact) return chip;
  return (
    <div className={cn("mb-4 flex items-center gap-3", className)}>
      <div className="h-1 flex-1 overflow-hidden rounded-[var(--r-full)] bg-muted" role="meter" aria-label="Brief quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quality.score}>
        <div
          className={cn("h-full transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]", blocking.length ? "bg-[color:var(--tone-danger-fg)]" : "bg-primary")}
          style={{ width: `${quality.score}%` }}
        />
      </div>
      {chip}
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
