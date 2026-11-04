"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { revealBankAction, type FullBank } from "./actions";

/**
 * "Show in full" (owner, 4 Nov 2026): the full bank details, read on a press
 * and shown in place. Each press is one identity read in the audit log; the
 * page's address does not change, and nothing is read ahead of time.
 */
export function BankReveal({ userId }: { userId: string }) {
  const [bank, setBank] = useState<FullBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (bank) {
    const rows: [string, string][] = [
      ["Name at the bank", bank.beneficiary_name],
      ["PAN", bank.pan],
      ["Account number", bank.account_number],
      ["IFSC", bank.ifsc],
      ["Account type", bank.account_type === "CURRENT" ? "Current" : "Savings"],
    ];
    return (
      <div className="space-y-2">
        <dl className="grid gap-x-6 gap-y-2 text-[length:var(--fs-2)] sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tabular font-mono">{v}</dd>
            </div>
          ))}
        </dl>
        <Button type="button" size="sm" variant="ghost" onClick={() => setBank(null)}>
          Hide
        </Button>
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-2)]">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await revealBankAction(userId);
            if ("error" in res) setError(res.error);
            else {
              setError(null);
              setBank(res);
            }
          })
        }
      >
        {pending ? "Opening…" : "Show in full"}
      </Button>
      <span className="text-muted-foreground">Each view is recorded in the audit log.</span>
      {error && <span className="w-full text-[color:var(--tone-danger-fg)]">The full details could not be shown: {error}</span>}
    </p>
  );
}
