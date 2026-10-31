/**
 * What each email is for (Phase 17): who gets it, the real event that sends
 * it, and whether the recipient can turn it off. The admin preview page and
 * docs/EMAIL.md read from here.
 */
import type { EmailTemplate } from "./templates";

export interface EmailCatalogEntry {
  template: EmailTemplate;
  audience: "Client" | "Designer applicant" | "Designer" | "Visitor";
  when: string;
  /** "always": part of the service. "optional": the client can turn it off. */
  kind: "always" | "optional";
}

export const EMAIL_CATALOG: EmailCatalogEntry[] = [
  { template: "WELCOME", audience: "Client", when: "A client creates their own account", kind: "always" },
  { template: "ORDER_PLACED_FOR_YOU", audience: "Client", when: "The team places an order for a client (email, WhatsApp or phone)", kind: "always" },
  { template: "ORDER_RECEIVED", audience: "Client", when: "A client sends a brief from the portal", kind: "always" },
  { template: "QUOTE_READY", audience: "Client", when: "The order is quoted (again on a new price)", kind: "always" },
  { template: "QUOTE_REMINDER", audience: "Client", when: "A quote is still unpaid after 24 hours", kind: "optional" },
  { template: "PAYMENT_RECEIVED", audience: "Client", when: "Payment is recorded", kind: "always" },
  { template: "ORDER_CONFIRMED", audience: "Client", when: "Paid and confirmed: the first-look clock starts", kind: "always" },
  { template: "FIRST_LOOK_READY", audience: "Client", when: "The first look is shared", kind: "always" },
  { template: "REVISION_RECEIVED", audience: "Client", when: "The client asks for changes", kind: "always" },
  { template: "REVISED_DESIGN_READY", audience: "Client", when: "A revised design is shared", kind: "always" },
  { template: "PREVIEW_REMINDER", audience: "Client", when: "A design waits for review for 48 hours", kind: "optional" },
  { template: "DESIGN_APPROVED", audience: "Client", when: "The client approves the design", kind: "always" },
  { template: "FILES_DELIVERED", audience: "Client", when: "Final files are released", kind: "always" },
  { template: "FEEDBACK_REQUEST", audience: "Client", when: "Three days after delivery", kind: "optional" },
  { template: "ORDER_DELAYED", audience: "Client", when: "A standard first look misses its time", kind: "always" },
  { template: "CREDIT_DECIDED", audience: "Client", when: "Admin decides the late-first-look credit", kind: "always" },
  { template: "PROBLEM_RECEIVED", audience: "Client", when: "The client raises a problem", kind: "always" },
  { template: "ORDER_REFUNDED", audience: "Client", when: "The order is refunded", kind: "always" },
  { template: "ORDER_CANCELLED", audience: "Client", when: "A sent order is cancelled", kind: "always" },
  { template: "NEW_MESSAGE", audience: "Client", when: "The team writes in the client conversation (at most one per order per 30 min)", kind: "optional" },
  { template: "CONTACT_RECEIVED", audience: "Visitor", when: "The contact form is sent", kind: "always" },
  { template: "DESIGNER_APPLICATION_RECEIVED", audience: "Designer applicant", when: "A designer applies", kind: "always" },
  { template: "DESIGNER_APPLICATION_ACCEPTED", audience: "Designer applicant", when: "An application is accepted", kind: "always" },
  { template: "DESIGNER_APPLICATION_REJECTED", audience: "Designer applicant", when: "An application is declined", kind: "always" },
  { template: "PAYOUT_SENT", audience: "Designer", when: "A payout is sent", kind: "always" },
];
