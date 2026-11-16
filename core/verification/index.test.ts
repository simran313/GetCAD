import { describe, expect, it } from "vitest";

import { renderEmail } from "../email/templates";
import { checkBusiness, checkProof, gateStep, PROOF_KINDS, proofKey, UNLOCKS } from "./index";

describe("client verification (0068)", () => {
  it("shows who-you-are first, then the business, then the review", () => {
    expect(gateStep({ account_status: "PENDING", has_profile: false, state: null })).toBe("profile");
    expect(gateStep({ account_status: "PENDING", has_profile: true, state: null })).toBe("business");
    expect(gateStep({ account_status: "PENDING", has_profile: true, state: "REJECTED" })).toBe("business");
    expect(gateStep({ account_status: "PENDING", has_profile: true, state: "SUBMITTED" })).toBe("review");
    expect(gateStep({ account_status: "SUSPENDED", has_profile: true, state: "APPROVED" })).toBe("suspended");
  });

  it("checks the business details with a plain reason", () => {
    const ok = { business_type: "RETAIL_JEWELER", country: "United States", address: "12 Main St, Austin", website: "example.com" };
    expect(checkBusiness(ok)).toBeNull();
    expect(checkBusiness({ ...ok, website: "@examplejewels" })).toBeNull();
    expect(checkBusiness({ ...ok, business_type: "PIRATE" })).toMatch(/kind of business/);
    expect(checkBusiness({ ...ok, address: "x" })).toMatch(/address/);
    expect(checkBusiness({ ...ok, website: "none" })).toMatch(/website or Instagram/);
  });

  it("accepts PDF and images up to 10 MB, nothing else", () => {
    expect(checkProof({ name: "ein.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(checkProof({ name: "x.exe", type: "application/x-msdownload", size: 1000 })).toMatch(/PDF, JPG/);
    expect(checkProof({ name: "big.pdf", type: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it("stores every proof in the client's own folder with a safe name", () => {
    expect(proofKey("user_abc", "../../etc/passwd", "id1")).toBe("clients/user_abc/id1-.._.._etc_passwd");
    expect(proofKey("user_abc", "EIN letter (2026).pdf", "id2")).toMatch(/^clients\/user_abc\/id2-EIN_letter_2026_.pdf$/);
  });

  it("names the features that unlock, and the proofs we accept", () => {
    expect(UNLOCKS.map(([t]) => t)).toEqual(expect.arrayContaining(["New orders", "Your orders", "Your files", "Wallet"]));
    expect(PROOF_KINDS.map(([k]) => k)).toContain("EIN_LETTER");
  });

  it("emails the client at each step, the decline with the admin's reason", () => {
    expect(renderEmail("CLIENT_VERIFICATION_RECEIVED", { name: "Nina Rao" }).subject).toMatch(/verifying your business/);
    const approved = renderEmail("CLIENT_APPROVED", { name: "Nina Rao", site_url: "https://thecadpillar.com" });
    expect(approved.html).toContain("https://thecadpillar.com/orders/new");
    const declined = renderEmail("CLIENT_VERIFICATION_DECLINED", { name: "Nina", reason: "<b>blurry</b> scan" });
    expect(declined.html).toContain("&lt;b&gt;blurry&lt;/b&gt; scan");
    expect(declined.text).toContain("blurry");
  });
});
