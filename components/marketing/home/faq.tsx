"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";

/** Objection-led FAQ (redesign step 4k): one open at a time, keyboard accessible. */
export function Faq({ items }: { items: [string, string][] }) {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-border border-y border-border">
      {items.map(([q, a]) => (
        <Accordion.Item key={q} value={q}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex min-h-16 w-full items-center justify-between gap-6 py-4 text-left text-[18px] font-medium tracking-[-0.01em] focus-visible:outline-none">
              {q}
              <Plus className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-base)] ease-out group-data-[state=open]:rotate-45" aria-hidden />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <p className="max-w-2xl pb-5 text-[16px] leading-[1.6] text-muted-foreground">{a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
