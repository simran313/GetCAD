import "server-only";

import { openSignInAccount } from "./accounts";

/**
 * Open (or find) the sign-in account for a client the team is placing an
 * order for (Phase 4a, owner answer: the team opens the account). See
 * openSignInAccount: email only, an existing account is reused.
 */
export const openClientAccount = openSignInAccount;
