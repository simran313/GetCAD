import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

import type { OrderRow } from "./types";

/**
 * How a team-placed order came in (Phase 4a): the screenshots of the request,
 * and for the team the client's contact with a ready-made WhatsApp message
 * and an email link. Screenshots reach the client and the team only; the
 * page never fetches them for a designer, and the database would return
 * nothing if it did (policies/0034).
 */

export interface Screenshot {
  id: string;
  position: number;
  url: string;
}

export interface ClientContact {
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
}

const SOURCE_WORDS: Record<string, string> = {
  email: "email",
  whatsapp: "WhatsApp",
  phone: "phone",
};

const small = "text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";

/** wa.me wants the number in international format, digits only. */
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function IntakePanel({
  order,
  screenshots,
  contact,
  orderUrl,
}: {
  order: OrderRow;
  screenshots: Screenshot[];
  contact: ClientContact | null;
  orderUrl: string | null;
}) {
  if (!order.source || order.source === "portal") return null;
  const via = SOURCE_WORDS[order.source] ?? order.source;
  const ref = order.display_ref ?? "";
  const message = [
    `Hi${contact?.contact_name ? ` ${contact.contact_name.split(" ")[0]}` : ""}, we've placed your order ${ref} on The CAD Pillar.`,
    orderUrl ? `You can follow it and pay once it's quoted here: ${orderUrl}` : "You can follow it in your portal.",
    "Sign in with your email; no password needed.",
  ].join(" ");
  const wa = contact?.phone ? whatsappLink(contact.phone, message) : null;
  const mail = contact?.email
    ? `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`Your order ${ref}`)}&body=${encodeURIComponent(message)}`
    : null;

  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>{order.relation === "CLIENT" ? `Placed via ${via} by the team` : `Received by ${via}`}</CardTitle>
      </CardHeader>
      <CardBody>
        {screenshots.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {screenshots.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img
                    src={s.url}
                    alt={`Screenshot ${s.position} of the request`}
                    className="aspect-[3/4] w-full rounded-md border border-border object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={small}>No screenshots.</p>
        )}

        {contact && (
          <div className="mt-3 space-y-2">
            <p className="text-[length:var(--fs-3)] leading-[var(--lh-3)]">
              {contact.business_name ?? "Client"}
              {contact.contact_name ? ` · ${contact.contact_name}` : ""}
              {contact.phone ? ` · ${contact.phone}` : ""}
              {contact.email ? ` · ${contact.email}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 text-[length:var(--fs-3)] hover:bg-accent"
                >
                  Send on WhatsApp
                </a>
              )}
              {mail && (
                <a href={mail} className="rounded-md border border-border px-3 py-1.5 text-[length:var(--fs-3)] hover:bg-accent">
                  Write an email
                </a>
              )}
            </div>
            <p className={small}>The button opens WhatsApp with the message written; you press send.</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
