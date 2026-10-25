"use client";

import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Cmd+K (redesign): jump to any page, order or client by reference, or run
 * an action. Items are passed in (already filtered to what this role may
 * see), so the palette never widens anyone's view.
 */
export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  onSelect?: () => void;
  icon?: React.ReactNode;
  keywords?: string[];
}

export function CommandPalette({
  groups,
  open: controlled,
  onOpenChange,
}: {
  groups: { heading: string; items: PaletteItem[] }[];
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = onOpenChange ?? setOwn;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search and jump"
      overlayClassName="fixed inset-0 z-50 bg-foreground/30"
      contentClassName="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-[var(--r-xl)] border border-border bg-background shadow-[var(--e-2)]"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Command.Input
          placeholder="Search orders, clients, pages…"
          className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-[var(--r-xs)] border border-border px-1.5 text-[12px] text-muted-foreground">Esc</kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-[15px] text-muted-foreground">Nothing matches. Try an order reference like MJ1-RN-C-4.</Command.Empty>
        {groups.map((g) => (
          <Command.Group
            key={g.heading}
            heading={g.heading}
            className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3"
          >
            {g.items.map((it) => (
              <Command.Item
                key={it.id}
                value={`${it.label} ${it.hint ?? ""} ${(it.keywords ?? []).join(" ")}`}
                onSelect={() => {
                  setOpen(false);
                  if (it.onSelect) it.onSelect();
                  else if (it.href) router.push(it.href);
                }}
                className="group flex h-11 cursor-pointer items-center gap-3 rounded-[var(--r-sm)] px-2.5 text-[15px] data-[selected=true]:bg-accent [&_svg]:h-4 [&_svg]:w-4"
              >
                <span className="text-muted-foreground">{it.icon}</span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="font-mono text-[13px] text-muted-foreground">{it.hint}</span>}
                <CornerDownLeft className="opacity-0 group-data-[selected=true]:opacity-60" />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
