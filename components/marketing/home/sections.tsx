import { Check, FileBox, FileText, Image as ImageIcon, MessageSquare, Phone, Scale, Upload } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { c } from "@/content/claims";
import { cn } from "@/lib/utils";

import { LiveOrderCard } from "./live-order-card";

/**
 * The homepage sections (redesign step 4), in conversion order. All claims
 * come from content/claims.ts; prices from DECISIONS §4.
 */

export const H1 = "text-[38px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[52px] lg:text-[56px]";
export const H2 = "text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]";
export const LEAD = "text-[18px] leading-[1.55] text-muted-foreground";

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
  tone = "white",
}: {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  tone?: "white" | "subtle" | "ink";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20 py-[var(--section-y)]",
        tone === "subtle" && "border-y border-border bg-subtle",
        tone === "ink" && "bg-foreground text-background",
        className,
      )}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {(eyebrow || title || lead) && (
          <header className="max-w-2xl">
            {eyebrow && <p className={cn("eyebrow", tone === "ink" && "text-background/70")}>{eyebrow}</p>}
            {title && <h2 className={cn(H2, eyebrow && "mt-3")}>{title}</h2>}
            {lead && <p className={cn(LEAD, "mt-4", tone === "ink" && "text-background/75")}>{lead}</p>}
          </header>
        )}
        {children && <div className={cn((eyebrow || title || lead) && "mt-12")}>{children}</div>}
      </div>
    </section>
  );
}

/* b. Hero ------------------------------------------------------------- */
export function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-24">
        <div>
          <p className="eyebrow">Jewelry CAD for the trade</p>
          <h1 className={cn(H1, "mt-4")}>
            Factory-ready jewelry CAD. <span className="whitespace-nowrap">Checked twice.</span>
          </h1>
          <p className={cn(LEAD, "mt-5 max-w-[36rem]")}>
            Senior designers build every file to cast first time, and a master craftsman signs it off before you see it.
            We work US hours, and it&apos;s guaranteed in writing.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Start your first design
            </Link>
            <Link href="#quote" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Get a free quote
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px] text-muted-foreground">
            {["Guaranteed in writing", "We work your hours", `Live call ${c("LIVE_CALL_HOURS")}`].map((chip) => (
              <li key={chip} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-foreground" aria-hidden />
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <LiveOrderCard />
      </div>
    </section>
  );
}

/* c. Proof bar --------------------------------------------------------- */
export function ProofBar() {
  const items: [string, string, string][] = [
    [c("DESIGNER_COUNT"), "senior CAD designers", `${c("MIN_EXPERIENCE_YEARS")} years each in production CAD`],
    ["2", "experts on every file", "Designer builds, master craftsman signs off"],
    [String(c("QC_CHECKPOINTS")), "point factory check", "Castable, to spec, first time"],
    [`${c("FIRST_LOOK_HOURS")}h`, "first look", "Or the order is free"],
  ];
  return (
    <section aria-label="In numbers" className="border-y border-border bg-subtle">
      <dl className="mx-auto grid max-w-[1200px] grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map(([n, label, sub], i) => (
          <div key={label} className={cn("py-8 pr-4 lg:py-10", i % 2 === 1 && "pl-4 lg:pl-0", i > 0 && "lg:border-l lg:border-border lg:pl-8")}>
            <dt className="sr-only">{label}</dt>
            <dd className="text-[40px] font-semibold leading-none tracking-[-0.035em] tabular sm:text-[48px]">{n}</dd>
            <dd className="mt-3 text-[16px] font-medium">{label}</dd>
            <dd className="mt-1 text-[15px] leading-[1.45] text-muted-foreground">{sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* d. How it works -------------------------------------------------------- */
function Snippet({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="h-[244px] overflow-hidden rounded-[var(--r-lg)] border border-border bg-[color:var(--app-ground)] p-4">
      <div className="rounded-[var(--r-md)] border border-border bg-card p-4 shadow-[var(--e-1)]">{children}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="Three steps. The first takes two minutes." lead="Brief from your phone, approve a first look, download files your caster can use the same day.">
      <ol className="grid gap-8 md:grid-cols-3">
        <li>
          <Snippet>
            <p className="text-[13px] font-medium text-muted-foreground">Your brief</p>
            <dl className="mt-2 space-y-1.5 text-[14px]">
              {[["Piece", "Halo ring"], ["Metal", "18K yellow"], ["Size", "US 7"], ["Centre stone", "1.0 ct oval"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground"><Upload className="h-3.5 w-3.5" /> sketch.jpg added</p>
          </Snippet>
          <p className="mt-5 text-[14px] font-medium text-muted-foreground tabular">01</p>
          <h3 className="mt-1 text-[20px] tracking-[-0.02em]">Send the brief</h3>
          <p className="mt-1.5 text-[16px] text-muted-foreground">A sketch or photo, size, metal and stones. You get a fixed price within the hour.</p>
        </li>
        <li>
          <Snippet>
            <StatusPill tone="attention">Ready for you</StatusPill>
            <p className="mt-3 text-[15px] font-semibold">First look · Halo ring</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex aspect-[4/3] items-center justify-center rounded-[var(--r-xs)] bg-muted text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
              ))}
            </div>
            <div className="mt-3 flex gap-1.5">
              <span className="flex flex-1 items-center justify-center rounded-[var(--r-xs)] py-1.5 bg-foreground text-[13px] font-medium text-background">Approve</span>
              <span className="flex flex-1 items-center justify-center rounded-[var(--r-xs)] py-1.5 border border-border text-[13px] font-medium">Ask for changes</span>
            </div>
          </Snippet>
          <p className="mt-5 text-[14px] font-medium text-muted-foreground tabular">02</p>
          <h3 className="mt-1 text-[20px] tracking-[-0.02em]">Approve the first look</h3>
          <p className="mt-1.5 text-[16px] text-muted-foreground">Within {c("FIRST_LOOK_HOURS")} hours of confirmation. {c("REVISIONS")} included.</p>
        </li>
        <li>
          <Snippet>
            <p className="text-[13px] font-medium text-muted-foreground">Your files</p>
            <ul className="mt-2 space-y-2 text-[14px]">
              {[[FileBox, "ring_v2.3dm", "Rhino"], [FileBox, "ring_v2.stl", "For your caster"], [FileText, "Spec sheet.pdf", "Signed"], [Scale, "Weight sheet.pdf", "5 alloys"]].map(([Icon, n, h]) => {
                const I = Icon as typeof FileBox;
                return (
                  <li key={n as string} className="flex items-center gap-2">
                    <I className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{n as string}</span>
                    <span className="text-[12px] text-muted-foreground">{h as string}</span>
                  </li>
                );
              })}
            </ul>
          </Snippet>
          <p className="mt-5 text-[14px] font-medium text-muted-foreground tabular">03</p>
          <h3 className="mt-1 text-[20px] tracking-[-0.02em]">Download and cast</h3>
          <p className="mt-1.5 text-[16px] text-muted-foreground">3DM, STL, renders, a signed spec sheet and a weight sheet.</p>
        </li>
      </ol>
    </Section>
  );
}

/* l. Final CTA and contact --------------------------------------------- */
export function FinalCta() {
  const phone = c("LIVE_CALL_PHONE");
  const whatsapp = c("WHATSAPP");
  const email = c("EMAIL");
  return (
    <Section id="contact" tone="ink">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <h2 className={H2}>Send one design. See the difference in {c("FIRST_LOOK_HOURS")} hours.</h2>
          <p className="mt-4 max-w-xl text-[18px] leading-[1.55] text-background/75">
            From {c("ENTRY_PRICE")} a design. Your first design {c("FIRST_DESIGN_PRICE")}. No retainer, no contract.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "bg-background text-foreground hover:bg-background/90")}>
              Start your first design
            </Link>
            <Link href="#quote" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "text-background hover:bg-background/10")}>
              Get a free quote
            </Link>
          </div>
        </div>
        <ul className="divide-y divide-background/15 rounded-[var(--r-lg)] border border-background/15">
          <li>
            <a href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "/contact"} className="flex items-center gap-4 p-5 hover:bg-background/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background text-foreground"><Phone className="h-5 w-5" /></span>
              <span>
                <span className="block text-[18px] font-semibold">Talk to us live</span>
                <span className="block text-[15px] text-background/70">{c("LIVE_CALL_HOURS")} · a real person, no ticket queue</span>
              </span>
            </a>
          </li>
          <li>
            <a href={whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : "/contact"} className="flex items-center gap-4 p-5 hover:bg-background/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-background/25"><MessageSquare className="h-5 w-5" /></span>
              <span>
                <span className="block text-[16px] font-medium">WhatsApp</span>
                <span className="block text-[15px] text-background/70">Send a photo of the piece</span>
              </span>
            </a>
          </li>
          <li>
            <a href={`mailto:${email}`} className="flex items-center gap-4 p-5 hover:bg-background/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-background/25"><FileText className="h-5 w-5" /></span>
              <span>
                <span className="block text-[16px] font-medium">Email</span>
                <span className="block text-[15px] text-background/70">{email}</span>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </Section>
  );
}
