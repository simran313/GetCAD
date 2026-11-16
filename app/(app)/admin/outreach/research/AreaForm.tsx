"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SEGMENTS } from "@/core/outreach";
import { SUGGESTED_AREAS } from "@/core/outreach/research";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

import { saveAreaAction } from "../actions";

/** Add an area to research: a business type in a city. Suggestions fill the city. */
export function AreaForm({ taken }: { taken: string[] }) {
  const router = useRouter();
  const [segment, setSegment] = useState("RETAIL_JEWELER");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("United States");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = (c: string, r: string) => `${segment}|${c.toLowerCase()}|${r.toLowerCase()}`;
  const free = SUGGESTED_AREAS.filter((a) => !taken.includes(key(a.city, a.region)));

  return (
    <form
      className="space-y-4"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await saveAreaAction(fd);
          if (!r.ok || !r.data) return setError(r.ok ? "No answer from the server." : r.error);
          toast("Area added. It is yours to research.");
          setCity("");
          setRegion("");
          router.push(`/admin/outreach/research?area=${r.data}`);
        });
      }}
    >
      <input type="hidden" name="status" value="IN_PROGRESS" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Business type" htmlFor="area-segment">
          <Select id="area-segment" name="segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
            {SEGMENTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="area-city">
          <Input id="area-city" name="city" required maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="State or region" htmlFor="area-region">
          <Input id="area-region" name="region" maxLength={80} value={region} onChange={(e) => setRegion(e.target.value)} />
        </Field>
        <Field label="Country" htmlFor="area-country">
          <Input id="area-country" name="country" maxLength={80} value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </div>
      {free.length > 0 && (
        <div className="space-y-2">
          <p className="text-[length:var(--fs-2)] text-muted-foreground">Or start with one of the main US jewelry markets:</p>
          <div className="flex flex-wrap gap-2">
            {free.map((a) => (
              <button
                key={`${a.city}-${a.region}`}
                type="button"
                title={"note" in a ? a.note : undefined}
                onClick={() => {
                  setCity(a.city);
                  setRegion(a.region);
                  setCountry("United States");
                }}
                className="rounded-full border border-border px-3 py-1 text-[length:var(--fs-2)] text-muted-foreground transition-colors hover:text-foreground"
              >
                {a.city}, {a.region}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[length:var(--fs-2)] text-[color:var(--tone-danger-fg)]">{error}</p>}
      <Button type="submit" disabled={pending || !city.trim()}>{pending ? "Adding…" : "Add and start researching"}</Button>
    </form>
  );
}

/** Change an area's status, or take an unowned one. */
export function AreaStatus({
  area,
  canEdit,
}: {
  area: { id: string; segment: string; city: string; region: string | null; country: string; status: string; owner_id: string | null; notes: string | null };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  const save = (status: string) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ id: area.id, segment: area.segment, city: area.city, region: area.region ?? "", country: area.country, status, notes: area.notes ?? "" })) fd.set(k, v);
    if (area.owner_id) fd.set("owner_id", area.owner_id);
    start(async () => {
      const r = await saveAreaAction(fd);
      if (!r.ok) return toast(r.error, "danger");
      toast(status === "DONE" ? "Area marked done." : "Saved.");
      router.refresh();
    });
  };
  return (
    <Select
      aria-label={`Status of ${area.city}`}
      value={area.status}
      disabled={pending}
      onChange={(e) => save(e.target.value)}
      className="h-[var(--ctl-sm)] w-36 text-[length:var(--fs-2)]"
    >
      <option value="TODO">To do</option>
      <option value="IN_PROGRESS">In progress</option>
      <option value="DONE">Done</option>
    </Select>
  );
}
