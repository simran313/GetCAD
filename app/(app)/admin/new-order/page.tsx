import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { redirect } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { newOrderForClientAction } from "./actions";
import { FilePicker } from "@/components/ui/file-picker";
import { Page } from "@/components/ui/page";

/**
 * A6 — place an order for a client from an email, a WhatsApp chat or a call
 * (Phase 4a). Admins and pod leads. At least one screenshot of the request;
 * everything else in the brief is optional and can be filled in on the order.
 */
export const dynamic = "force-dynamic";

interface ClientHit {
  user_id: string;
  client_code: string | null;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
}

const label = "block text-[length:var(--fs-2)] leading-[var(--lh-2)] text-muted-foreground";
const card = "mt-4 rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)] p-[var(--s-4)]";

const PRODUCTS: [string, string][] = [
  ["RING", "Ring"],
  ["BAND", "Band"],
  ["PENDANT", "Pendant"],
  ["EARRING", "Earrings"],
  ["BRACELET", "Bracelet"],
  ["BANGLE", "Bangle"],
  ["NECKLACE", "Necklace"],
  ["OTHER", "Other (incl. brooch)"],
];

export default async function NewOrderForClientPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createUserSupabaseClient();
  const { data: isTeam } = await supabase.rpc("i_am_team");
  if (isTeam !== true) {
    return (
      <Page>
        <h1 className="text-[length:var(--fs-6)] font-semibold tracking-[var(--ls-6)]">New order for a client</h1>
        <ErrorPanel title="Not available to your role" message="Admins and pod leads place orders for clients." className="mt-4" />
      </Page>
    );
  }

  const { q = "" } = await searchParams;
  const query = q.trim();
  let hits: ClientHit[] = [];
  let searchError: string | null = null;
  if (query.length >= 2) {
    const { data, error } = await supabase.rpc("find_clients", { p_query: query });
    hits = (data ?? []) as ClientHit[];
    searchError = error?.message ?? null;
  }
  const { data: podRows } = await supabase.from("pods").select("id, name").order("name");
  const pods = (podRows ?? []) as { id: string; name: string }[];

  return (
    <Page>
      <PageHeader
        eyebrow="On behalf of a client"
        title="Create order for a client"
        description="For orders that came by email, WhatsApp or phone. Add a screenshot of the request; fill in the brief on the order afterwards."
      />

      <form method="get" className={`${card} flex flex-wrap items-end gap-2`}>
        <label className={`${label} flex-1`}>
          Find the client (business, name, email, phone or code)
          <Input name="q" defaultValue={query} minLength={2} className="mt-0.5 w-full" />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>

      <form action={newOrderForClientAction} className={`${card} space-y-4`}>
        <fieldset>
          <legend className="text-[length:var(--fs-4)] font-medium">1. Client</legend>
          {searchError && <p className="mt-1 text-[length:var(--fs-2)] text-destructive">{searchError}</p>}
          {hits.length > 0 && (
            <ul className="mt-2 space-y-1">
              {hits.map((h) => (
                <li key={h.user_id}>
                  <label className="flex items-baseline gap-2 text-[length:var(--fs-3)]">
                    <input type="radio" name="client_id" value={h.user_id} defaultChecked={hits.length === 1} />
                    <span>
                      <span className="font-medium">{h.business_name ?? h.contact_name ?? "Client"}</span>
                      {h.client_code ? <span className="ml-1 font-mono text-muted-foreground">{h.client_code}</span> : null}
                      <span className="ml-2 text-muted-foreground">
                        {[h.contact_name, h.email, h.phone].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && hits.length === 0 && !searchError && (
            <p className="mt-1 text-[length:var(--fs-3)] text-muted-foreground">No client found. Add them below.</p>
          )}
          <p className="mt-3 text-[length:var(--fs-3)] font-medium">
            {hits.length > 0 ? "Or a new client" : "New client"}
          </p>
          <p className="text-[length:var(--fs-2)] text-muted-foreground">
            Opens their account. They sign in later with this email (a code, no password). An email that already has an
            account is reused.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={label}>
              Business name
              <Input name="new_business" maxLength={120} className="mt-0.5 w-full" />
            </label>
            <label className={label}>
              Contact name
              <Input name="new_contact" maxLength={120} className="mt-0.5 w-full" />
            </label>
            <label className={label}>
              Email
              <Input name="new_email" type="email" className="mt-0.5 w-full" />
            </label>
            <label className={label}>
              WhatsApp / phone (with country code)
              <Input name="new_phone" type="tel" placeholder="+91 98…" className="mt-0.5 w-full" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[length:var(--fs-4)] font-medium">2. The order</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className={label}>
              Came by
              <Select name="source" defaultValue="email" className="mt-0.5 w-full">
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">Phone</option>
              </Select>
            </label>
            <label className={label}>
              Product
              <Select name="product" defaultValue="RING" className="mt-0.5 w-full">
                {PRODUCTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Service
              <Select name="service" defaultValue="cad" className="mt-0.5 w-full">
                <option value="cad">CAD</option>
                <option value="render">Render</option>
                <option value="cad_render">CAD + render</option>
              </Select>
            </label>
            <label className={label}>
              Received at (optional)
              <Input name="received_at" type="datetime-local" className="mt-0.5 w-full" />
            </label>
            {pods.length > 0 && (
              <label className={label}>
                Pod
                <Select name="pod_id" defaultValue={pods[0]!.id} className="mt-0.5 w-full">
                  {pods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="">No pod yet (admin)</option>
                </Select>
              </label>
            )}
          </div>
          <label className={`${label} mt-2`}>
            What they asked for (the client sees this as the first message)
            <Textarea name="note" rows={3} maxLength={4000} className="mt-0.5 w-full" />
          </label>
        </fieldset>

        <fieldset>
          <legend className="text-[length:var(--fs-4)] font-medium">3. Screenshots of the request</legend>
          <p className="text-[length:var(--fs-2)] text-muted-foreground">
            At least one (PNG or JPEG, up to 20). Seen by the client and the team, never by designers.
          </p>
          <FilePicker
            name="screenshots"
            label="Screenshots of the request"
            accept="image/png,image/jpeg"
            multiple
            required
            buttonLabel="Choose screenshots"
            className="mt-2"
          />
        </fieldset>

        <label className="flex items-center gap-2 text-[length:var(--fs-3)]">
          <input type="checkbox" name="notify" defaultChecked />
          Email the client that the order is placed (the order page also has a WhatsApp button)
        </label>

        <Button type="submit">Place order</Button>
      </form>
    </Page>
  );
}
