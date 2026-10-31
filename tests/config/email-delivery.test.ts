import { describe, expect, it } from "vitest";

import { DEFAULT_TEST_INBOX, addressFor, emailDelivery } from "../../config/email";
import { CLAIMS } from "../../content/claims";
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_LINK } from "../../core/email/layout";

/**
 * Client emails stay in the test inbox until the owner says go (Phase 17):
 * only EMAIL_DELIVERY=live sends to real recipients; anything else, including
 * unset, a typo or "true", goes to the test inbox with the real address shown.
 */
describe("email delivery mode", () => {
  it("defaults to test mode and the owner's test inbox", () => {
    expect(emailDelivery({} as unknown as NodeJS.ProcessEnv)).toEqual({ live: false, testTo: DEFAULT_TEST_INBOX });
    for (const v of ["", "true", "1", "production", "liv"]) expect(emailDelivery({ EMAIL_DELIVERY: v } as unknown as NodeJS.ProcessEnv).live).toBe(false);
  });

  it("is live only when EMAIL_DELIVERY=live", () => {
    expect(emailDelivery({ EMAIL_DELIVERY: " Live " } as unknown as NodeJS.ProcessEnv).live).toBe(true);
  });

  it("a test send goes to the test inbox and names the real recipient", () => {
    const test = emailDelivery({ EMAIL_TEST_TO: "qa@example.com" } as unknown as NodeJS.ProcessEnv);
    expect(addressFor(test, "client@acme.example", "Your quote is ready")).toEqual({
      to: "qa@example.com",
      subject: "[Test → client@acme.example] Your quote is ready",
    });
    expect(addressFor({ live: true, testTo: "qa@example.com" }, "client@acme.example", "Your quote is ready")).toEqual({
      to: "client@acme.example",
      subject: "Your quote is ready",
    });
  });

  it("emails show the same WhatsApp number as the website", () => {
    const digits = String(CLAIMS.WHATSAPP.value);
    expect(SUPPORT_WHATSAPP.replace(/\D/g, "")).toBe(digits);
    expect(SUPPORT_WHATSAPP_LINK).toBe(`https://wa.me/${digits}`);
  });
});
