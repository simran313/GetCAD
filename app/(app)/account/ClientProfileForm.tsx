import { HEARD_ABOUT } from "@/core";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { saveClientProfileAction } from "./actions";

export interface ClientProfile {
  business_name: string | null;
  legal_name: string;
  email: string;
  phone: string | null;
}

/**
 * Who the client is: the business (it becomes their client code, MJ1…), a
 * contact name, email and phone. Only the client and the team see it;
 * designers never do.
 */
export function ClientProfileForm({
  profile,
  email,
  next,
  submitLabel,
  askHeardAbout = false,
}: {
  profile: ClientProfile | null;
  email: string | null;
  next: string;
  submitLabel: string;
  /** S3 only: "How did you hear about us?", required once (Phase 6). */
  askHeardAbout?: boolean;
}) {
  return (
    <form action={saveClientProfileAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="next" value={next} />
      <Field label="Business name" htmlFor="business_name" hint="Your client code is made from it." className="sm:col-span-2">
        <Input id="business_name" name="business_name" required maxLength={120} defaultValue={profile?.business_name ?? ""} />
      </Field>
      <Field label="Your name" htmlFor="legal_name">
        <Input id="legal_name" name="legal_name" required maxLength={120} defaultValue={profile?.legal_name ?? ""} />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" required defaultValue={profile?.email ?? email ?? ""} />
      </Field>
      <Field label="WhatsApp / phone" htmlFor="phone" optional hint="With country code, e.g. +91 98…">
        <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
      </Field>
      {askHeardAbout && (
        <Field label="How did you hear about us?" htmlFor="heard_about">
          <Select id="heard_about" name="heard_about" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {HEARD_ABOUT.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex items-end sm:col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
