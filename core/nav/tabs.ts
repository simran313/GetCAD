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
  /** False keeps it out of the phone's bottom bar (the mockups show four there). */
  mobile?: boolean;
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
  // Second on a desk, as in the mockups (C1). On a phone the bottom bar keeps
  // Home · Orders · Messages · Account and New order lives on Home and Orders.
  // `activeTabKey` prefers the longer match, so /orders/new lights this.
  { key: "new", label: "New order", href: "/orders/new", icon: "plus", mobile: false },
  { key: "orders", label: "Orders", href: "/orders", icon: "list" },
  { key: "messages", label: "Messages", href: "/messages", icon: "message" },
  { key: "wallet", label: "Wallet", href: "/wallet", icon: "wallet", mobile: false },
  { key: "files", label: "Files", href: "/files", icon: "file", mobile: false },
  ACCOUNT,
];

// D2–D6 (Phase 5c). Onboarding is not a tab: until the agreement is signed
// the designer's Home leads there, and an unsigned designer has no jobs.
const DESIGNER_TABS: Tab[] = [
  { key: "home", label: "Home", href: "/home", icon: "home" },
  { key: "work", label: "Open jobs", href: "/work", icon: "work" },
  { key: "messages", label: "Messages", href: "/messages", icon: "message" },
  { key: "earnings", label: "Earnings", href: "/work/earnings", icon: "money" },
  ACCOUNT,
];

// P1–P6 (Phase 5c): the pod lead's own workspace. Create order is the
// Phase 4a screen; on a phone it is reached from the QC queue.
const POD_LEAD_TABS: Tab[] = [
  { key: "qc", label: "QC queue", href: "/qc", icon: "queue" },
  { key: "board", label: "Team board", href: "/pod/board", icon: "board" },
  { key: "orders", label: "All orders", href: "/qc/orders", icon: "list" },
  { key: "new", label: "Create order", href: "/admin/new-order", icon: "plus", mobile: false },
  { key: "messages", label: "Messages", href: "/messages", icon: "message" },
  { key: "earnings", label: "Earnings", href: "/qc/earnings", icon: "money", mobile: false },
  ACCOUNT,
];

// A1–A10 (Phase 5d): the admin workspace. Sales, Ops and Finance share it;
// each page asks the database, which refuses what a single role may not do.
// On a phone: Queue, All orders, Create order, Account.
const STAFF_TABS: Tab[] = [
  { key: "queue", label: "Queue", href: "/admin", icon: "queue" },
  { key: "new", label: "Create order", href: "/admin/new-order", icon: "plus" },
  { key: "orders", label: "All orders", href: "/admin/orders", icon: "list" },
  // Every order's client and designer conversations, messages or not (Phase 15).
  // On a phone it is the bar's own Messages button.
  { key: "messages", label: "Messages", href: "/messages", icon: "message", mobile: false },
  { key: "billing", label: "Billing", href: "/admin/billing", icon: "wallet", mobile: false },
  { key: "clients", label: "Clients", href: "/admin/clients", icon: "user", mobile: false },
  { key: "access", label: "Access", href: "/admin/access", icon: "board", mobile: false },
  { key: "applications", label: "Applications", href: "/admin/applications", icon: "work", mobile: false },
  { key: "leads", label: "Leads", href: "/admin/leads", icon: "message", mobile: false },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: "board", mobile: false },
  ACCOUNT,
]

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
    case "QC":
      return { label: "Pod lead workspace", tone: "dark" };
    case "OPS":
    case "SALES":
    case "FINANCE":
      return { label: "Admin workspace", tone: "dark" };
    default:
      return { label: "Client workspace", tone: "light" };
  }
}

export function tabsForRole(role: string): Tab[] {
  switch (role) {
    case "DESIGNER":
      return DESIGNER_TABS;
    case "QC":
      return POD_LEAD_TABS;
    case "OPS":
    case "SALES":
    case "FINANCE":
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

/** The tabs the phone's bottom bar shows. */
export function mobileTabs(tabs: Tab[]): Tab[] {
  return tabs.filter((t) => t.mobile !== false);
}
