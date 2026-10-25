import { clerkSetup } from "@clerk/testing/playwright";

import { appEnv } from "./stack/env.mjs";

/** A Clerk testing token, so sign-ins are not challenged as bots. */
export default async function globalSetup(): Promise<void> {
  // The cleaned keys prepare.ts wrote, for the sign-in helpers too.
  Object.assign(process.env, appEnv() ?? {});
  await clerkSetup();
}
