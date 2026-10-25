import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Who the e2e suite signs in as, and what prepare.ts seeded (Phase 8). */

export const E2E_DIR = join(process.cwd(), ".e2e");

// `+clerk_test` addresses are Clerk's test emails: no mail is sent.
export const PERSONAS = {
  admin: { email: "e2e-admin+clerk_test@getcad.dev", firstName: "Asha" },
  podLead: { email: "e2e-podlead+clerk_test@getcad.dev", firstName: "Priya" },
  designer: { email: "e2e-designer+clerk_test@getcad.dev", firstName: "Rohan", legalName: "Rohan Designer" },
  client: {
    email: "e2e-client+clerk_test@getcad.dev",
    firstName: "Meera",
    business: "Meera Jewels",
    legalName: "Meera Shah",
    phone: "+91 98200 11223",
  },
  client2: {
    email: "e2e-client2+clerk_test@getcad.dev",
    firstName: "Tara",
    business: "Tara Fine Gems",
    legalName: "Tara Iyer",
    phone: "+91 98450 77889",
  },
} as const;

export type Persona = keyof typeof PERSONAS;

export interface E2eState {
  anonKey: string;
  serviceKey: string;
  clerkIssuer: string;
  users: Record<Persona, string>;
  fixtures: {
    podId: string;
    crawlOrders: { sameClient: [string, string]; otherClient: string };
    orderRefs: Record<string, string>;
    clientCodes: Record<string, string>;
    clientProfileIds: Record<string, string>;
  };
}

export function readState(): E2eState {
  return JSON.parse(readFileSync(join(E2E_DIR, "state.json"), "utf8")) as E2eState;
}

/** pk_test_<base64 "xxxx.clerk.accounts.dev$"> → https://xxxx.clerk.accounts.dev */
export function clerkIssuer(publishableKey: string): string {
  const host = Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64").toString("utf8").replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("the Clerk publishable key does not decode to a host");
  return `https://${host}`;
}
