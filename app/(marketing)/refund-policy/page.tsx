import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { JsonLd } from "@/components/seo/json-ld";
import { c } from "@/content/claims";
import { pageJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Cancellation and Refund Policy",
  "When you can cancel a jewelry CAD order, when we refund or credit it, and how refunds reach you. Plain language, from how The CAD Pillar works.",
  "/refund-policy",
);

/**
 * Cancellation and refunds (payments readiness, 16 Nov 2026): what the
 * product already does (DECISIONS §6–§8, §13; the cancel and refund flows),
 * written out as one policy, as payment providers require.
 */
const SECTIONS = [
  {
    heading: "Before you pay",
    body: [
      "Nothing is charged until you accept a price. You can delete a draft, cancel an order that has been sent or priced, or decline a price at any time from your order, at no cost.",
    ],
  },
  {
    heading: "After you pay, before work starts",
    body: [
      "An order starts once it is paid and we have confirmed the brief is complete. If you change your mind after paying but before we confirm the order, message us and we refund the full amount.",
    ],
  },
  {
    heading: "After work has started",
    body: [
      `Once an order is confirmed, a designer is working on it, so we do not refund a change of mind. Instead, ${c("REVISIONS")} are included, and you can raise a problem on the order at any time while it is in progress or ready to preview; we review it and either send it back for rework or refund you.`,
    ],
  },
  {
    heading: "If we are late",
    body: [
      `For standard pieces, if we do not share your first look within ${c("FIRST_LOOK_HOURS")} hours of the order being paid and confirmed, the full amount you paid is credited, and we still complete the order. We decide the form of the credit (applied to your next order, refunded, or partly credited) and tell you.`,
    ],
  },
  {
    heading: "If a file is wrong",
    body: [
      `Every delivered CAD file comes with a signed spec sheet. If a file does not meet its own spec sheet, we fix it free of charge and refund the CAD fee for that order. Raise it on the order within ${c("CLAIM_WINDOW_DAYS")} days of delivery; the terms of service list what is covered.`,
    ],
  },
  {
    heading: "How refunds are paid",
    body: [
      "Refunds go back to the method you paid with. Card refunds usually appear within 5 to 10 business days, depending on your bank. Payments made by bank transfer, Wise or PayPal are refunded the same way they were received.",
      "Credits appear in your Wallet and are used on your next order.",
    ],
  },
  {
    heading: "Questions",
    body: [
      `Write to ${c("EMAIL")} or message us on WhatsApp (${c("LIVE_CALL_PHONE")}). For anything on a specific order, use the conversation on that order so the team sees it at once.`,
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <>
      <JsonLd data={pageJsonLd("/refund-policy", "Cancellation and refund policy")} />
      <LegalPage
        title="Cancellation and refund policy"
        updated="November 2026"
        intro="When you can cancel, when we refund or credit, and how the money reaches you."
        sections={SECTIONS}
        draft={false}
      />
    </>
  );
}
