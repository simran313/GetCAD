import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusTag } from "@/components/ui/status-tag";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_FILES_BUCKET } from "@/config/supabase";
import { shortDate } from "@/lib/client/orders";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import type { ClaimRow } from "./AfterDelivery";
import { decideClaimAction } from "./previewActions";

/**
 * A6 for the team: the client's evidence, re-measure, decide. The pod lead
 * decides an open claim; a claim sent to admin review, or an admin
 * overturning a rejection, is the admin's (decide_spec_claim, 0051).
 */
export interface TeamClaimRow extends ClaimRow {
  description: string;
  casting_details: string | null;
  hash_match: boolean;
  matched_version: number | null;
  decided_at: string | null;
  file_object_key: string | null;
  photo_keys: string[] | null;
}

export async function TeamClaims({ orderId, claims, isAdmin }: { orderId: string; claims: TeamClaimRow[]; isAdmin: boolean }) {
  const storage = createAdminSupabaseClient().storage.from(ORDER_FILES_BUCKET);
  const sign = async (key: string | null) => (key ? ((await storage.createSignedUrl(key, 60 * 15)).data?.signedUrl ?? null) : null);
  const signed = await Promise.all(
    claims.map(async (c) => ({
      file: await sign(c.file_object_key),
      photos: (await Promise.all((c.photo_keys ?? []).map(sign))).filter((u): u is string => !!u),
    })),
  );

  return (
    <Card as="section" id="claims">
      <CardHeader>
        <CardTitle>Spec claims</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[length:var(--fs-2)]">
        {claims.map((c, i) => {
          const canDecide = c.status === "open" || (isAdmin && (c.status === "admin_review" || c.status === "rejected"));
          return (
            <div key={c.id} className="space-y-2 rounded-[var(--r-sm)] border border-border p-[var(--s-3)]">
              <p className="flex flex-wrap items-center gap-2">
                <StatusTag kind={c.status === "open" || c.status === "admin_review" ? "needs" : "muted"}>{c.status.replace("_", " ")}</StatusTag>
                <span className="font-medium">{c.spec.replace("_", " ")}</span>
                <span className="text-muted-foreground">
                  · {shortDate(c.created_at)} · {c.hash_match ? `file matches v${c.matched_version ?? "?"}` : "file does not match"}
                </span>
              </p>
              <p>{c.description}</p>
              {c.casting_details && <p className="text-muted-foreground">Casting: {c.casting_details}</p>}
              {c.not_covered_reason && <p className="text-muted-foreground">{c.not_covered_reason}</p>}
              <p className="flex flex-wrap gap-3">
                {signed[i]!.file && (
                  <a href={signed[i]!.file!} className="underline underline-offset-4">
                    Their file
                  </a>
                )}
                {signed[i]!.photos.map((u, n) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    Photo {n + 1}
                  </a>
                ))}
              </p>
              {c.decision_note && (
                <p>
                  {c.measured?.value ? `Measured ${c.measured.value}. ` : ""}
                  {c.decision_note}
                </p>
              )}
              {canDecide && (
                <form action={decideClaimAction} className="space-y-2 border-t border-border pt-2">
                  <input type="hidden" name="order_id" value={orderId} />
                  <input type="hidden" name="claim_id" value={c.id} />
                  <Input name="measured" placeholder="Re-measured value, e.g. 0.74 mm" aria-label="Re-measured value" maxLength={200} />
                  <Textarea name="note" required rows={2} maxLength={2000} placeholder="What you found" aria-label="Decision note" />
                  <div className="flex gap-2">
                    <Button type="submit" name="upheld" value="1" size="sm">
                      Uphold · free fix + credit
                    </Button>
                    {c.status !== "rejected" && (
                      <Button type="submit" name="upheld" value="0" size="sm" variant="outline">
                        Spec met · reject
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
