"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, PenLine, X } from "lucide-react";
import { useState } from "react";

import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import type { ChatBrief } from "../types";

/**
 * The brief as the first message of the conversation (owner, 7 Nov 2026):
 * what the order is, its reference pictures and the client's notes, so the
 * pod lead and the designer talk about the design with it in view. It sits
 * on the client's side: on the right for the client ("Your brief"), on the
 * left for the team and the designer. A picture opens full screen and can be
 * marked up and sent in this conversation, like any picture in it.
 */
const SHOWN = 5;

export function BriefCard({
  brief,
  mine,
  onMarkup,
}: {
  brief: ChatBrief;
  /** The viewer is the client: the brief is their own message. */
  mine: boolean;
  /** Set when the viewer may post here: mark up a picture and send it. */
  onMarkup?: (picture: Blob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const image = viewing == null ? null : brief.images[viewing];
  const lines = open ? brief.lines : brief.lines.slice(0, SHOWN);
  const more = brief.lines.length - SHOWN;

  const markUp = async () => {
    if (!image || !onMarkup) return;
    try {
      const res = await fetch(`/api/reference-images/${image.id}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setViewing(null);
      onMarkup(blob);
    } catch {
      toast("This picture could not be opened for marking up.", "danger");
    }
  };

  return (
    <div className={cn("flex flex-col pb-2", mine ? "items-end" : "items-start")}>
      <span className="mb-0.5 px-1 text-[length:var(--fs-1)] font-medium text-muted-foreground">{mine ? "Your brief" : "Brief · from the client"}</span>
      <article
        aria-label="The order brief"
        className={cn(
          "w-full max-w-[92%] space-y-2.5 rounded-[var(--r-lg)] px-3 py-2.5 text-[length:var(--fs-3)] sm:max-w-[80%]",
          mine ? "rounded-br-[var(--r-xs)] bg-[color:var(--bubble-mine)]" : "rounded-bl-[var(--r-xs)] border border-border bg-card shadow-[var(--e-1)]",
        )}
      >
        <p className="text-[length:var(--fs-4)] font-semibold leading-[var(--lh-4)]">{brief.title}</p>

        {brief.images.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {brief.images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setViewing(i)}
                aria-label={`Open reference picture ${i + 1}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--r-md)] bg-subtle"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served through the reference-image gate */}
                <img src={`/api/reference-images/${img.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                {img.pins.length > 0 && (
                  <span className="absolute bottom-1 right-1 rounded-[var(--r-full)] bg-black/70 px-1.5 text-[length:var(--fs-1)] font-medium text-white">
                    {img.pins.length} note{img.pins.length === 1 ? "" : "s"}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {brief.images.length > 0 && onMarkup && (
          <p className="text-[length:var(--fs-1)] text-muted-foreground">Tap a picture, then Mark up to circle what to change and send it here.</p>
        )}

        {lines.length > 0 && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-2)] leading-[var(--lh-2)]">
            {lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-muted-foreground">{l.label}</dt>
                <dd className="min-w-0 break-words">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {more > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-[var(--ctl-sm)] items-center gap-1 text-[length:var(--fs-2)] font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? "Show less" : `Show the full brief (${more} more)`}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
        {brief.notes && <p className="whitespace-pre-wrap break-words border-t border-border pt-2 text-[length:var(--fs-2)]">“{brief.notes}”</p>}
      </article>

      <Dialog.Root open={!!image} onOpenChange={(o) => !o && setViewing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
          <Dialog.Content className="fixed inset-0 z-[60] flex flex-col outline-none">
            <div className="flex items-center justify-between gap-3 p-3 pt-[max(0.75rem,var(--safe-top))] text-white">
              <Dialog.Title className="min-w-0 truncate text-[length:var(--fs-3)]">
                Reference picture {viewing != null ? `${viewing + 1} of ${brief.images.length}` : ""}
              </Dialog.Title>
              <Dialog.Description className="sr-only">A reference picture from the brief</Dialog.Description>
              <div className="flex items-center gap-1">
                {onMarkup && (
                  <button
                    type="button"
                    onClick={() => void markUp()}
                    className="inline-flex min-h-[var(--ctl-icon)] items-center gap-1.5 rounded-[var(--r-sm)] px-3 text-[length:var(--fs-3)] font-medium hover:bg-white/10"
                  >
                    <PenLine className="h-5 w-5" aria-hidden /> Mark up
                  </button>
                )}
                <Dialog.Close aria-label="Close" className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] items-center justify-center rounded-[var(--r-sm)] hover:bg-white/10">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
            </div>
            {image && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- served through the reference-image gate */}
                <img src={`/api/reference-images/${image.id}`} alt={`Reference picture ${(viewing ?? 0) + 1}`} className="min-h-0 flex-1 object-contain p-3" />
                {image.pins.length > 0 && (
                  <ol className="max-h-[30vh] space-y-1 overflow-y-auto px-4 pb-[max(1rem,var(--safe-bottom))] text-[length:var(--fs-3)] text-white">
                    {image.pins.map((p, i) => (
                      <li key={i}>
                        <span className="tabular mr-2 font-medium">{i + 1}</span>
                        {p}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
