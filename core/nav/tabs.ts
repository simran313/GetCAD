/**
 * What each role can navigate to.
 *
 * THE BUG THIS FIXES. The app header currently renders Dashboard, Orders, Staff
 * and Designers to every signed-in user, unconditionally. A client sees links
 * into staff tooling. On a desktop header that reads as clutter; in a four-item
 * bottom bar it is most of the app, and it tells a customer what internal
 * screens exist. Navigation is not access control — the database refuses those
 * pages either way — but advertising a door you cannot open is still a
 * disclosure, and it is one this product in particular should not make.
 *
 * The design prototype collapses staff into a single "Staff" persona with one
 * queue. The system does not: OPS, SALES, FINANCE and QC have genuinely
 * different permissions, and the same screen means different things to them.
 * The shell here is deliberately shared — same tabs, same shape — while what
 * the queue CONTAINS is filtered per role by the database. That keeps the
 * design's structure without pretending four roles are one.
 *
 * Framework-free (no next/*, no react) so the rule is unit-tested rather than
 * inspected by eye in a component.
 */

export interface Tab {
  /** Stable key — used for the active-state comparison, never displayed. */
  key: string;
  label: string;
  href: string;
  /** Icon name; the component maps it. Kept as data so this stays framework-free. */
  icon: "home" | "list" | "work" | "queue" | "user" | "plus" | "message" | "wallet" | "file" | "board" | "money";
}

const ACCOUNT: Tab = { key: "account", label: "Account", href: "/account", icon: "user" };

/**
 * Tabs are per role, and the labels differ on purpose.
 *
 * A designer's "My work" and a client's "Orders" are the same route showing
 * different rows, but they are not the same idea to the person reading it: one
 * is a queue of things to do, the other is a record of things bought.
 *
 * Missing on purpose, until the routes they point at exist: the designer's
 * "Earnings" and staff "Inbox". A tab that leads to a 404 is worse than a tab
 * that is not there yet.
 */
const CLIENT_TABS: Tab[] = [
  { key: "home", label: "Home", href: "/home", icon: "home" },
  // Second, as in the mockups (C1): starting a job is what a client comes for.
  // `activeTabKey` prefers the longer match, so /orders/new lights this rather
  // than Orders. Messages, Wallet and Files join with their screens (5b).
  { key: "new", label: "New order", href: "/orders/new", icon: "plus" },
  { key: "orders", label: "Orders", href: "/orders", icon: "list" },
  ACCOUNT,
];

const DESIGNER_TABS: Tab[] = [
  { key: "home", label: "Home", href: "/home", icon: "home" },
  { key: "orders", label: "My work", href: "/orders", icon: "work" },
  // Restoring a link that scoping navigation by role accidentally dropped.
  // Before that change the header showed every destination to everyone, which
  // is how this one was reachable at all. Onboarding is where a designer signs
  // the agreement, and an unsigned designer cannot be assigned work — so an
  // unreachable page here is a designer who can never start.
  { key: "onboarding", label: "Onboarding", href: "/onboarding/designer", icon: "work" },
  ACCOUNT,
];

const STAFF_TABS: Tab[] = [
  { key: "queue", label: "Queue", href: "/admin", icon: "queue" },
  { key: "orders", label: "Orders", href: "/orders", icon: "list" },
  // Admins and pod leads place orders from email, WhatsApp and phone (Phase
  // 4a); the page refuses anyone else.
  { key: "new", label: "Create order", href: "/admin/new-order", icon: "plus" },
  ACCOUNT,
];

/**
 * Which workspace the shell says it is (docs/design). Clients and designers
 * get the white sidebar; the team (admins and pod leads) the black one, so a
 * staff member who is also a client can tell at a glance which hat is on.
 */
export interface Workspace {
  label: string;
  tone: "light" | "dark";
}

export function workspaceFor(role: string): Workspace {
  switch (role) {
    case "DESIGNER":
      return { label: "Designer workspace", tone: "light" };
    case "OPS":
    case "SALES":
    case "FINANCE":
    case "QC":
      return { label: "Team workspace", tone: "dark" };
    default:
      return { label: "Client workspace", tone: "light" };
  }
}

export function tabsForRole(role: string): Tab[] {
  switch (role) {
    case "DESIGNER":
      return DESIGNER_TABS;
    case "OPS":
    case "SALES":
    case "FINANCE":
    case "QC":
      return STAFF_TABS;
    case "CLIENT":
      return CLIENT_TABS;
    default:
      // An unrecognised or not-yet-assigned role gets the client shell: the
      // least-privileged set, and the one whose pages fail gracefully rather
      // than showing an empty staff queue.
      return CLIENT_TABS;
  }
}

/**
 * Which tab is highlighted for a given path.
 *
 * Prefix-matched so a detail route keeps its parent tab lit — `/orders/abc123`
 * is still "Orders". Longest match wins, so a future `/orders/new` tab would
 * beat `/orders` rather than both appearing active.
 */
export function activeTabKey(pathname: string, tabs: Tab[]): string | null {
  let best: Tab | null = null;
  for (const tab of tabs) {
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      if (!best || tab.href.length > best.href.length) best = tab;
    }
  }
  return best?.key ?? null;
}
