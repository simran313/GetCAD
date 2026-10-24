import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Terms of service", "The terms for ordering jewelry CAD from The CAD Pillar.", "/terms");

// Drafted from docs/DECISIONS.md v1.2 (§1, §4, §6–§8, §13) for legal review.
const SECTIONS = [
  {
    heading: "Who we are and who we serve",
    body: [
      "The CAD Pillar (\"we\") makes jewelry CAD files and renders for jewelry businesses. We work only with businesses (\"you\"), not with consumers. Our studio is in Mumbai, India, and works US business hours.",
    ],
  },
  {
    heading: "Orders and prices",
    body: [
      "You send a brief through your account. We reply with a price. Standard pieces are $55, complex pieces $85, sculpted and figurative pieces are quoted from $120, and your first standard design is $49 (once per account). Render-only orders are quoted.",
      "You only pay when you accept a price. An order starts once it is paid and we have confirmed the brief is complete.",
      "Payment is by card or UPI through Razorpay, or by Wise, bank transfer or PayPal by arrangement. Prices are in US dollars.",
    ],
  },
  {
    heading: "What you receive",
    body: [
      "For a CAD order: 3DM and STL files, three render views, a signed spec sheet, a weight sheet and a 3D preview link. Files are named by our system and have identifying metadata removed.",
      "Final files are released once you approve the work.",
    ],
  },
  {
    heading: "First-look guarantee",
    body: [
      "For standard pieces (categories A–F), we share a first look within 6 hours of the order being both paid and confirmed. If we miss it, the full amount you paid is credited, and we still complete the order. We decide the form of the credit (applied to your next order, refunded, or partly credited) and tell you.",
      "Complex pieces (categories G–L) have a deadline we state with the price; no credit applies to them.",
    ],
  },
  {
    heading: "Spec guarantee and claims",
    body: [
      "Every delivery includes a signed spec sheet. If a delivered file does not meet its own spec sheet, we fix it free of charge and refund the CAD fee for that order.",
      "To claim, raise a problem on the order within 30 days of delivery and send the file you used, photos and casting details. We re-measure our archived file and share the result.",
      "Not covered: casting failures where the archived file meets its spec; files edited after delivery (we check the file's fingerprint); specifications you asked us to go below, as recorded on the spec sheet; and claims made after 30 days. More than two claims in a quarter from one client are reviewed by hand.",
    ],
  },
  {
    heading: "Revisions",
    body: [
      "Two revision rounds are included within 14 days of the first look. After that, or for changes after approval, a change is a new order at its own price. Changes our own quality check asks for do not count as your revisions.",
    ],
  },
  {
    heading: "Ownership and confidentiality",
    body: [
      "Once an order is paid, you own the files we make for it and may use them as you wish. We work white-label: nothing we deliver carries our name.",
      "Your briefs, files and customer details are confidential by default. Our designers do not see who you or your customers are.",
    ],
  },
  {
    heading: "Limits of liability",
    body: [
      "Our total liability for an order is limited to the CAD fee paid for that order. We are not responsible for metal, stones, casting costs or other losses arising from the use of a file.",
    ],
  },
  {
    heading: "Your account",
    body: [
      "Keep your sign-in details safe. You are responsible for orders placed from your account. We may suspend an account that is used to abuse the service.",
    ],
  },
  {
    heading: "Changes and contact",
    body: [
      "We may update these terms; the version in force when you place an order applies to that order. Questions: use the contact page. [Governing law and company details to be confirmed with counsel.]",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="October 2026"
      intro="The rules for ordering from The CAD Pillar, in plain language."
      sections={SECTIONS}
    />
  );
}
