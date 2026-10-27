import Link from "next/link";

import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { CopyField } from "@/components/preview/copy-field";
import { shortDate } from "@/lib/client/orders";

import { createPreviewLinkAction, updatePreviewLinkAction } from "./previewActions";
import { viewerZone } from "@/lib/time/zone";

/**
 * Phase 7b on the client's order page: share a branded 3D preview with
 * their customer (A5), and the spec guarantee's claims (A6).
 */
export interface PreviewLinkRow {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
}

export interface ClaimRow {
  id: string;
  spec: string;
  status: "not_covered" | "open" | "admin_review" | "upheld" | "rejected";
  not_covered_reason: string | null;
  measured: { value?: string } | null;
  decision_note: string | null;
  fix_order_id: string | null;
  created_at: string;
}

const CLAIM_STATE: Record<ClaimRow["status"], { word: string; kind: "needs" | "active" | "done" | "muted" }> = {
  open: { word: "Being re-measured", kind: "active" },
  admin_review: { word: "Being reviewed", kind: "active" },
  upheld: { word: "Upheld", kind: "done" },
  rejected: { word: "Spec met", kind: "muted" },
  not_covered: { word: "Not covered", kind: "muted" },
};

export async function ShareCard({
  orderId,
  links,
  newLink,
  siteUrl,
}: {
  orderId: string;
  links: PreviewLinkRow[];
  newLink: string | null;
  siteUrl: string;
}) {
  const tz = await viewerZone();
  const now = Date.now();
  return (
    <Card as="section" id="share">
      <CardHeader>
        <CardTitle>Share a 3D preview</CardTitle>
        <span className="text-[length:var(--fs-2)] text-muted-foreground">Your logo and name · no prices, nothing of ours</span>
      </CardHeader>
      <CardBody className="space-y-4">
        {newLink && (
          <div className="space-y-2 rounded-[var(--r-md)] border border-foreground p-[var(--s-3)]">
            <p className="text-[length:var(--fs-2)] font-medium">Copy this link now — for safety it is shown only once.</p>
            <CopyField value={`${siteUrl}/p/${newLink}`} />
          </div>
        )}
        <form action={createPreviewLinkAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <label className="text-[length:var(--fs-2)] text-muted-foreground" htmlFor="days">
            Open for
          </label>
          <Select id="days" name="days" defaultValue="30" className="w-auto">
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Create link
          </Button>
        </form>
        {links.length > 0 && (
          <ul className="divide-y divide-border rounded-[var(--r-sm)] border border-border">
            {links.map((l) => {
              const live = !l.revoked_at && Date.parse(l.expires_at) > now;
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--fs-2)]">
                  <span>
                    Made {shortDate(l.created_at, tz)} · {l.view_count} view{l.view_count === 1 ? "" : "s"} ·{" "}
                    {l.revoked_at ? "turned off" : live ? `open until ${shortDate(l.expires_at, tz)}` : "expired"}
                  </span>
                  {!l.revoked_at && (
                    <span className="flex gap-2">
                      <form action={updatePreviewLinkAction}>
                        <input type="hidden" name="order_id" value={orderId} />
                        <input type="hidden" name="link_id" value={l.id} />
                        <input type="hidden" name="days" value="30" />
                        <Button type="submit" size="sm" variant="outline">
                          +30 days
                        </Button>
                      </form>
                      <form action={updatePreviewLinkAction}>
                        <input type="hidden" name="order_id" value={orderId} />
                        <input type="hidden" name="link_id" value={l.id} />
                        <input type="hidden" name="revoke" value="1" />
                        <Button type="submit" size="sm" variant="ghost">
                          Turn off
                        </Button>
                      </form>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export async function ClaimsCard({
  orderId,
  claims,
  claimWindow: window,
}: {
  orderId: string;
  claims: ClaimRow[];
  claimWindow: { open: boolean; closes_at: string | null } | null;
}) {
  const tz = await viewerZone();
  if (claims.length === 0 && !window?.open) return null;
  return (
    <Card as="section" id="claims">
      <CardHeader>
        <CardTitle>Spec guarantee</CardTitle>
        {window?.open && window.closes_at && (
          <span className="text-[length:var(--fs-2)] text-muted-foreground">Claims open until {shortDate(window.closes_at, tz)}</span>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {claims.map((c) => (
          <div key={c.id} className="space-y-1 rounded-[var(--r-sm)] border border-border p-[var(--s-3)] text-[length:var(--fs-2)]">
            <p className="flex flex-wrap items-center gap-2">
              <StatusTag kind={CLAIM_STATE[c.status].kind}>{CLAIM_STATE[c.status].word}</StatusTag>
              <span className="font-medium">{c.spec.replace("_", " ")}</span>
              <span className="text-muted-foreground">· {shortDate(c.created_at, tz)}</span>
            </p>
            {c.not_covered_reason && <p>{c.not_covered_reason}</p>}
            {c.decision_note && (
              <p>
                {c.measured?.value ? `Measured: ${c.measured.value}. ` : ""}
                {c.decision_note}
              </p>
            )}
            {c.status === "upheld" && (
              <p>
                The CAD fee is credited to your next order.{" "}
                {c.fix_order_id && (
                  <Link href={`/orders/${c.fix_order_id}`} className="underline underline-offset-4">
                    Follow the free fix
                  </Link>
                )}
              </p>
            )}
          </div>
        ))}
        {window?.open && (
          <Link href={`/orders/${orderId}/claim`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            A file broke its spec sheet? Open a claim
          </Link>
        )}
      </CardBody>
    </Card>
  );
}
