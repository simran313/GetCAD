import { clerkSetup } from "@clerk/testing/playwright";

/** A Clerk testing token, so sign-ins are not challenged as bots. */
export default async function globalSetup(): Promise<void> {
  await clerkSetup();
}
