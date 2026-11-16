import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PLACEHOLDERS, SEQUENCE } from "@/core/outreach";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { OutreachNav, OutreachUnavailable } from "../shared";

export const dynamic = "force-dynamic";

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium underline underline-offset-2">{children}</Link>
);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="tabular mr-2 text-muted-foreground">{n}.</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-[length:var(--fs-3)] leading-[var(--lh-3)]">{children}</CardBody>
    </Card>
  );
}

/** How outreach works, start to finish, in the order a new teammate does it. */
export default async function OutreachGuidePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase.rpc("outreach_dashboard");
  if (error) return <OutreachUnavailable message={error.message} />;
  const isAdmin = (data as { is_admin: boolean }).is_admin;

  return (
    <Page form>
      <PageHeader
        title="How outreach works"
        description="Set up once, then about an hour a day: send what Today lists, record replies, watch the dashboard."
      />
      <OutreachNav current="guide" isAdmin={isAdmin} />

      <Step n={1} title="Add the addresses you write from (once, admins)">
        <p>
          Under <A href="/admin/outreach/senders">Senders</A>, add each email address (and WhatsApp or Instagram handle) you will write from.
          Use your main domain for people you know and a second domain for prospects, so a spam complaint can never hurt the main one.
        </p>
        <p>
          Start every new email address at <span className="font-medium">20 a day</span> for the first two to three weeks, then raise it
          slowly (30, then 40). Each sender can be handed to one person: the contacts it gets are theirs.
        </p>
      </Step>

      <Step n={2} title="Bring in your contacts">
        <p>
          Two lists: <span className="font-medium">Existing contacts</span> (people you already know) and{" "}
          <span className="font-medium">Prospects</span> (businesses you found). Add one at a time under{" "}
          <A href="/admin/outreach/new">Add contact</A>, or many at once under <A href="/admin/outreach/import">Import a list</A>.
        </p>
        <p>
          A contact needs only a name (business or person) or an email, and one way to reach them. The import page shows the file format and
          has a sample file to fill in. Repeats, existing clients and do-not-contact people are skipped. New contacts are shared evenly
          between the senders for that list.
        </p>
      </Step>

      <Step n={3} title="Every day: work through Today">
        <p>
          <A href="/admin/outreach/today">Today</A> lists the follow-ups due, then new contacts, up to each sender&apos;s daily limit. For
          each one: press Write, check the message (replace anything in [square brackets] with a real detail about them), press{" "}
          <span className="font-medium">Open in Gmail</span> or <span className="font-medium">Open WhatsApp</span>, send it there, then
          come back and press <span className="font-medium">Mark as sent</span>.
        </p>
        <p>Nothing is sent from the portal: Gmail opens in the sender&apos;s own account, so replies land in that inbox.</p>
      </Step>

      <Step n={4} title="The three messages">
        <ul className="list-inside list-disc">
          {SEQUENCE.map((s) => (
            <li key={s.step}>
              <span className="font-medium">{s.label}</span>: day {s.day}
              {s.step > 1 ? ` (${s.wait})` : ""}
            </li>
          ))}
        </ul>
        <p>
          Marking a message sent puts the next one on Today on the right day. After message 3 nothing more is due: the contact rests unless
          you set a date. A reply stops the sequence.
        </p>
      </Step>

      <Step n={5} title="When they reply">
        <p>
          Open the contact (search on the <A href="/admin/outreach">Dashboard</A>), choose <span className="font-medium">They replied</span>{" "}
          and note what they said. Then set the stage: Interested, Not now (with a date to come back) or Not interested.
        </p>
        <p>
          Anyone who asks not to be contacted: mark <span className="font-medium">Do not contact</span> at once, with the reason. They are
          never written to or imported again.
        </p>
      </Step>

      <Step n={6} title="Templates">
        <p>
          <A href="/admin/outreach/templates">Templates</A> holds the messages for each channel, list and step, with how often each was sent
          and how many replied. The right one is picked for each contact (their list and business type). These words are filled in for you:
        </p>
        <ul className="list-inside list-disc">
          {PLACEHOLDERS.map(([k, v]) => (
            <li key={k}>
              <span className="font-mono">{k}</span>: {v}
            </li>
          ))}
        </ul>
        <p>Change one thing at a time (the subject or the first line), then compare reply rates after 50 or more sends.</p>
      </Step>

      <Step n={7} title="Reading the dashboard">
        <p>
          The <A href="/admin/outreach">Dashboard</A> shows the funnel (written to → replied → interested → became a client → ordered), the
          last 14 days, and each sender&apos;s reply rate. A sender with a much lower reply rate than the others may be landing in spam:
          lower its limit and check its setup. A contact counts as a client once they sign up with the same email.
        </p>
      </Step>

      <Step n={8} title="Rules">
        <ul className="list-inside list-disc">
          <li>Existing contacts: only people you know through this business. Prospects: only businesses found in public sources.</li>
          <li>Every email says how to opt out (the templates do); honour it the same day.</li>
          <li>Never go over a sender&apos;s daily limit; Today stops at it for you.</li>
        </ul>
      </Step>
    </Page>
  );
}
