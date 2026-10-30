import { IntentLink } from "@/components/ui/intent-link";
import { cn } from "@/lib/utils";

import type { Conversation } from "./MessagesView";

/**
 * One conversation in a short list (Home): the order number, what the piece
 * is, the last message, when, and how many are unread. To a client the other side is
 * always "Your team"; staff and designers keep the aliases they had.
 */
export function InboxRow({
  c,
  client,
  at,
  active = false,
  meta,
}: {
  c: Conversation;
  client: boolean;
  /** Already in the viewer's zone ("2m ago"). */
  at: string;
  active?: boolean;
  meta?: React.ReactNode;
}) {
  const who = c.last_mine ? "You" : client ? "Your team" : c.last_alias;
  return (
    <IntentLink
      href={`/messages/${c.order_id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block border-b border-border px-[var(--s-4)] py-[var(--s-3)] last:border-b-0",
        active ? "bg-muted" : "hover:bg-subtle",
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="tabular min-w-0 truncate font-mono font-semibold tracking-tight">{c.display_ref || "Order"}</span>
        <span className="shrink-0 text-[length:var(--fs-1)] text-muted-foreground">{at}</span>
      </span>
      {c.title && <span className="block truncate text-[length:var(--fs-2)] font-medium">{c.title}</span>}
      <span className="mt-0.5 flex items-center justify-between gap-2">
        <span className={cn("min-w-0 truncate text-[length:var(--fs-2)]", c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
          {c.last_body ? `${who}: ${c.last_body}` : "No messages yet"}
        </span>
        {c.unread > 0 && (
          <span className="tabular shrink-0 rounded-[var(--r-full)] bg-foreground px-2 text-[length:var(--fs-1)] leading-5 text-background">
            {c.unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </span>
      {meta && <span className="mt-1 block text-[length:var(--fs-1)] text-muted-foreground">{meta}</span>}
    </IntentLink>
  );
}
