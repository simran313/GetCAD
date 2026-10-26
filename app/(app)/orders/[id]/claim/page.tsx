import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { shortDate } from "@/lib/client/orders";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { openClaimAction } from "../../previewActions";
import { Page } from "@/components/ui/page";

/**
 * A6 — raise a spec claim. The file they cast from is matched against the
 * fingerprints of what we delivered; the pod lead re-measures it. Upheld:
 * a free fix and the CAD fee credited (DECISIONS, Phase 7b).
 */
export const dynamic = "force-dynamic";

const SPECS: [string, string][] = [
  ["wall", "Wall thinner than the certificate says"],
  ["prong", "Prong thinner than the certificate says"],
  ["stone_seat", "Stone seat the wrong size"],
  ["size", "Ring size or dimensions wrong"],
  ["mesh", "Mesh not watertight / would not print"],
  ["open_edges", "Open edges in the file"],
  ["other", "Something else on the spec sheet"],
];

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("claim_window", { p_order_id: id });
  if (error || !data) notFound();
  const w = data as { open: boolean; closes_at: string | null; days: number };

  return (
    <Page form>
      <Link href={`/orders/${id}`} className="text-[length:var(--fs-3)] text-muted-foreground hover:text-foreground">
        ← The order
      </Link>
      <PageHeader
        title="Raise a spec claim"
        description="If the file we delivered broke a number on its certificate, we fix it free and credit the CAD fee to your next order."
      />
      {!w.open ? (
        <Card className="p-[var(--s-6)] text-[length:var(--fs-3)] text-muted-foreground">
          Claims are open for {w.days} days after delivery, one at a time. This order has none open to you now.
        </Card>
      ) : (
        <Card as="section">
          <CardBody>
            <form action={openClaimAction} className="space-y-5">
              <input type="hidden" name="order_id" value={id} />
              <Field label="What is wrong" htmlFor="spec">
                <Select
                  id="spec"
                  name="spec"
                  required
                >
                  {SPECS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Describe it" htmlFor="description" hint="Where on the piece, and what you measured.">
                <Textarea id="description" name="description" required rows={4} maxLength={4000} />
              </Field>
              <Field label="Casting details" htmlFor="casting" hint="Caster, alloy, shrinkage allowance, any changes made to the file.">
                <Textarea id="casting" name="casting" required rows={3} maxLength={2000} />
              </Field>
              <Field
                label="The file you cast from"
                htmlFor="file"
                hint="The STL or 3DM exactly as you used it. We match its fingerprint with what we delivered; an edited file is not covered."
              >
                <input id="file" type="file" name="file" accept=".stl,.3dm" required />
              </Field>
              <Field label="Photos of the piece" htmlFor="photos" hint="1 to 10 photos, PNG or JPEG, ideally with a gauge or calliper in shot.">
                <input id="photos" type="file" name="photos" accept="image/png,image/jpeg" multiple required />
              </Field>
              <p className="text-[length:var(--fs-2)] text-muted-foreground">
                Open until {w.closes_at ? shortDate(w.closes_at) : "—"}. Not covered: an edited file, a spec you asked us to change
                (it is on the certificate as a waiver), or casting and finishing loss.
              </p>
              <Button type="submit">Send the claim</Button>
            </form>
          </CardBody>
        </Card>
      )}
    </Page>
  );
}
