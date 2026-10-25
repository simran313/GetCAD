import {
  Clock,
  EyeOff,
  Phone,
  ReceiptText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { CLAIMS, c, showClaim } from "@/content/claims";
import { cn } from "@/lib/utils";

/* f. Why it costs less: an illustrative cost stack, no numbers ---------- */
const TRADITIONAL = ["Design time", "Project manager", "Scheduling and chasing", "Status emails and calls", "Office and idle time"];
const TCP = ["Design time", "Independent QC sign-off"];

export function CostStack() {
  return (
    <figure className="grid gap-6 sm:grid-cols-2" aria-label="Illustrative cost comparison">
      {[
        ["A traditional studio", TRADITIONAL, false],
        ["The CAD Pillar", TCP, true],
      ].map(([title, rows, ours]) => (
        <div key={title as string} className={cn("flex flex-col rounded-[var(--r-xl)] border p-5", ours ? "border-foreground bg-card shadow-[var(--e-2)]" : "border-border bg-subtle")}>
          <p className="text-[16px] font-semibold">{title as string}</p>
          <div className="mt-4 flex flex-1 flex-col-reverse gap-1.5">
            {(rows as string[]).map((r, i) => (
              <div
                key={r}
                className={cn(
                  "flex h-11 items-center rounded-[var(--r-sm)] px-3 text-[15px]",
                  i === 0 ? "bg-foreground text-background" : ours ? "border border-foreground/30 bg-background" : "border border-border bg-background text-muted-foreground",
                )}
              >
                {r}
              </div>
            ))}
            {ours && (
              <div className="flex h-11 items-center rounded-[var(--r-sm)] border border-dashed border-border px-3 text-[14px] text-muted-foreground">
                Intake, routing, scheduling, tracking: automated
              </div>
            )}
          </div>
        </div>
      ))}
      <figcaption className="text-[14px] text-muted-foreground sm:col-span-2">Illustrative. Bars show what you pay for, not amounts.</figcaption>
    </figure>
  );
}

/* g. Why jewelers switch ---------------------------------------------- */
export function SwitchGrid() {
  const cards: [React.ReactNode, string, string][] = [
    [<EyeOff key="i" />, "Your designs stay yours", "Designers never see who you are or who your customer is. Your work is never shown to anyone."],
    [<UsersRound key="i" />, "Two experts, every file", "A designer builds it and a master craftsman checks it. No single sign-off reaches you."],
    [<Clock key="i" />, "We work your hours", "The studio runs US business hours. Brief at 6pm, first look by morning."],
    [<Phone key="i" />, "A real person, live", `Call or video your account team ${showClaim("LIVE_CALL_HOURS") ? c("LIVE_CALL_HOURS") : "in US business hours"}. No ticket queues.`],
    [<ShieldCheck key="i" />, "Guaranteed in writing", `Miss the ${c("FIRST_LOOK_HOURS")}-hour first look and the full amount comes back as credit. We still finish it.`],
    [<ReceiptText key="i" />, "Pay per design", "No retainer, no contract, no minimums. Reorder in one click."],
  ];
  return (
    <ul className="grid gap-px overflow-hidden rounded-[var(--r-xl)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([icon, title, body]) => (
        <li key={title} className="bg-card p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] border border-border text-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
          <h3 className="mt-4 text-[18px] tracking-[-0.015em]">{title}</h3>
          <p className="mt-1.5 text-[16px] leading-[1.5] text-muted-foreground">{body}</p>
        </li>
      ))}
      {/* Enable when live:
          - Watermarked previews / view-only file viewer
          - Tamper-proof order history
          - Smart intake with country-aware sizing */}
    </ul>
  );
}

/* h. Work gallery: anonymised placeholder slots ------------------------ */
export function WorkGallery() {
  const stages = ["Sketch", "CAD", "Render"];
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <li key={n} className="rounded-[var(--r-xl)] border border-border bg-card p-3 shadow-[var(--e-1)]">
            <div className="grid grid-cols-3 gap-1.5">
              {stages.map((s) => (
                <figure key={s} className="min-w-0">
                  <div className="flex aspect-square items-center justify-center rounded-[var(--r-sm)] border border-dashed border-border bg-subtle text-[12px] text-muted-foreground">
                    {s}
                  </div>
                </figure>
              ))}
            </div>
            <p className="px-1 pb-1 pt-3 text-[15px] font-medium">Piece {n} <span className="font-normal text-muted-foreground">· placeholder</span></p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] text-muted-foreground">Real work goes here only with the client&apos;s written permission, with nothing that identifies them.</p>
    </div>
  );
}

/* j. Team strip ------------------------------------------------------- */
export function TeamStrip() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CLAIMS.TEAM.value.map((p, i) => (
        <li key={i} className="rounded-[var(--r-xl)] border border-border bg-card p-5 shadow-[var(--e-1)]">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-[15px] font-semibold text-muted-foreground">{p.role === "Master QC" ? "QC" : "CAD"}</span>
          <p className="mt-4 text-[17px] font-semibold">{p.role}</p>
          <p className="mt-0.5 text-[15px] text-muted-foreground">
            {p.years} · {p.specialty}
          </p>
        </li>
      ))}
    </ul>
  );
}
