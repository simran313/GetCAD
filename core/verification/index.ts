/**
 * Client verification (KYC) before the portal opens (owner, 16 Nov 2026;
 * DECISIONS 1.30, migration 0068). Framework-free: the words a pending client
 * reads, the choices they make and the checks on what they send, shared by
 * the verification screen, its server actions, the admin review and tests.
 */

/** What a business is; the database accepts exactly these (0068). */
export const BUSINESS_TYPES = [
  ["RETAIL_JEWELER", "Retail or custom jeweler"],
  ["MANUFACTURER", "Manufacturer or trade shop"],
  ["BRAND_WHOLESALER", "Brand or wholesaler"],
  ["DESIGN_STUDIO", "Jewelry design studio"],
  ["OTHER", "Other jewelry business"],
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number][0];

/** The proofs of registration we accept; the database accepts exactly these (0068). */
export const PROOF_KINDS = [
  ["EIN_LETTER", "EIN letter (IRS CP 575 or 147C)"],
  ["STATE_REGISTRATION", "State business registration or certificate of formation"],
  ["SALES_TAX_PERMIT", "Sales tax permit or resale certificate"],
  ["BUSINESS_LICENSE", "Business license"],
  ["FOREIGN_REGISTRATION", "Registration outside the US (GST, Companies House, ABN…)"],
  ["OTHER", "Other official proof of the business"],
] as const;
export type ProofKind = (typeof PROOF_KINDS)[number][0];

export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_MAX_FILES = 5;

/** Everything a client gets once the business is verified: the screen lists it. */
export const UNLOCKS: [string, string][] = [
  ["New orders", "Brief a ring, pendant, earrings or any piece from a sketch, photo or reference, and mark up exactly what to change."],
  ["A price within the hour", "A fixed price before you pay, and a first look within 6 hours of confirmation for standard pieces."],
  ["Your orders", "Live status for every order, chat with your team, and two revision rounds within 14 days."],
  ["Your files", "3DM and STL ready to print and cast, render views, a signed spec sheet, a weight sheet and a summary sheet."],
  ["A preview for your customer", "A 3D preview link with your logo that your customer can turn in the browser."],
  ["Your factory's rules", "Write your standing rules once; every designer sees them on every order."],
  ["Wallet", "Payments, invoices and retainers for regular orders."],
  ["Alerts", "Email and phone notifications the moment a price, a design or a message is ready."],
];

export type VerificationState = "SUBMITTED" | "APPROVED" | "REJECTED" | null;

export interface MyVerification {
  account_status: "PENDING" | "ACTIVE" | "SUSPENDED";
  has_profile: boolean;
  state: VerificationState;
  business_type: BusinessType | null;
  country: string | null;
  address: string | null;
  website: string | null;
  role_title: string | null;
  submitted_at: string | null;
  decision_reason: string | null;
  documents: { id: string; kind: ProofKind; file_name: string }[];
}

/** Which screen a client sees, in order: who you are, the business, waiting. */
export type GateStep = "profile" | "business" | "review" | "suspended";
export function gateStep(v: Pick<MyVerification, "account_status" | "has_profile" | "state">): GateStep {
  if (v.account_status === "SUSPENDED") return "suspended";
  if (!v.has_profile) return "profile";
  return v.state === "SUBMITTED" ? "review" : "business";
}

export const isBusinessType = (v: string): v is BusinessType => BUSINESS_TYPES.some(([k]) => k === v);
export const isProofKind = (v: string): v is ProofKind => PROOF_KINDS.some(([k]) => k === v);
export const businessTypeLabel = (v: string | null) => BUSINESS_TYPES.find(([k]) => k === v)?.[1] ?? "—";
export const proofKindLabel = (v: string | null) => PROOF_KINDS.find(([k]) => k === v)?.[1] ?? "Document";

/** The business details, checked before anything is sent; a reason when one is wrong. */
export function checkBusiness(f: { business_type: string; country: string; address: string; website: string }): string | null {
  if (!isBusinessType(f.business_type)) return "Choose what kind of business it is.";
  if (f.country.trim().length < 2) return "Add the country the business is registered in.";
  if (f.address.trim().length < 5) return "Add the business address.";
  const site = f.website.trim();
  if (site.length < 4 || !/[.@]/.test(site)) return "Add the business website or Instagram (for example example.com or @examplejewels).";
  return null;
}

/** One proof file: a reason when it cannot be accepted. */
export function checkProof(f: { name: string; type: string; size: number }): string | null {
  if (!(PROOF_TYPES as readonly string[]).includes(f.type)) return `${f.name}: upload a PDF, JPG, PNG or WebP.`;
  if (f.size <= 0) return `${f.name}: the file is empty.`;
  if (f.size > PROOF_MAX_BYTES) return `${f.name}: larger than 10 MB.`;
  return null;
}

/** Where a client's proof is stored: always inside their own folder (0068 checks it). */
export function proofKey(userId: string, fileName: string, id: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "document";
  return `clients/${userId}/${id}-${safe}`;
}
