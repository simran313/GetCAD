import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Privacy policy",
  "What The CAD Pillar collects, why, and how it is handled — in plain language.",
  "/privacy",
);

// A factual description of what the platform collects, derived from the
// schema rather than a template; a draft for legal review (owner answer Q14).
const SECTIONS = [
  {
    heading: "What we collect, and when",
    body: [
      "Website forms: the name, company, email and message you send us, or the email and piece you enter to get a price.",
      "Your account: an identifier from our sign-in provider (Clerk), your business name, contact name, email and phone, your role and account status.",
      "Orders: the brief, reference pictures, files, messages, prices, payments and every status change.",
      "Designers and pod leads who are paid by us: the bank details needed to pay them (account holder, account number, IFSC, account type, PAN).",
    ],
  },
  {
    heading: "How we use it",
    body: [
      "To price, make and deliver your orders, to send you order emails and notifications you choose, to pay our team, and to keep the records the business and the law require.",
    ],
  },
  {
    heading: "Where you came from",
    body: [
      "When you first visit, we keep one first-party cookie noting how you arrived (for example the campaign in the link and the site that referred you). When you create an account we save it with your answer to \"How did you hear about us?\". We use it only to understand which channels bring clients. We do not use third-party advertising or analytics scripts.",
      "We also count key steps — a brief started, a brief sent, a payment, an approval — to see where people get stuck. These records stay in our own database.",
    ],
  },
  {
    heading: "Who sees what",
    body: [
      "Our designers never see who you or your customers are. Orders reach them by a job code, without your name, prices or contact details, and identifying metadata is removed from files before they are stored.",
      "Bank details are readable by no one through the ordinary application; you see only the last four characters of your account number and PAN.",
    ],
  },
  {
    heading: "Who we share it with",
    body: [
      "We do not sell your information. We use service providers to run the service: Clerk (sign-in), Supabase (database and file storage), Razorpay (card and UPI payments — we never see or store card numbers), Resend (email) and Vercel (hosting). Our team works from India, so your information is processed there and in the regions these providers use.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Order history, payments and our activity log are kept as financial and audit records. Files are stored privately and reached only through short-lived links for the people entitled to them. Website leads we no longer need are deleted on request.",
    ],
  },
  {
    heading: "Your choices",
    body: [
      "You can ask what we hold about you, ask us to correct it, or ask us to delete it. Where information is part of a financial or audit record we may need to keep it, and we will tell you if so. To ask, use the contact page.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 2026"
      intro="What we collect, why, and how it is handled."
      sections={SECTIONS}
    />
  );
}
