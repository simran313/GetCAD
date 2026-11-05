"use client";

import Link from "next/link";
import { Fragment, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { addDesignersAction, type AddDesignersResult, type AddedDesigner } from "./actions";

const links = (people: AddedDesigner[]) =>
  people.map((p, i) => (
    <Fragment key={p.userId}>
      {i > 0 && ", "}
      <Link href={`/admin/designers/${p.userId}`} className="underline underline-offset-4">
        {p.label}
      </Link>
    </Fragment>
  ));

/** Paste the list: one designer per line, "email - Name". */
export function AddDesigners() {
  const [result, action, pending] = useActionState<AddDesignersResult | null, FormData>(addDesignersAction, null);
  return (
    <form action={action} className="space-y-3">
      <Field
        label="Designers, one per line"
        htmlFor="people"
        hint="email - Name, as in your list. A phone number on the line is kept for WhatsApp. Each person gets a sign-in account; they sign in with a code sent to that email."
      >
        <Textarea id="people" name="people" rows={6} required placeholder={"name@example.com - Full Name\nother@example.com - Second Name"} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add designers"}
      </Button>
      {result && (
        <div className="space-y-2 text-[length:var(--fs-2)]" aria-live="polite">
          {result.added.length > 0 && (
            <p>
              <span className="font-medium">Added {result.added.length}:</span> {links(result.added)}
            </p>
          )}
          {result.already.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-medium">Already on file:</span> {links(result.already)}
            </p>
          )}
          {result.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[color:var(--tone-danger-fg)]">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
