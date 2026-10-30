import {
  Banknote,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  ListOrdered,
  Magnet,
  MessageSquare,
  Plus,
  Settings,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";

import type { Tab } from "@/core";

import type { NavGroup, NavItem } from "./sidebar";

/**
 * How the shell draws each role's tabs (redesign step 5). Which tabs a role
 * gets stays in core/nav/tabs (unit-tested); this only adds an icon per
 * destination (unique within a sidebar), the sidebar groups and the phone's
 * bottom bar. Account lives in the user menu, not the list.
 */
const ICON: Record<string, React.ReactNode> = {
  home: <Home />,
  queue: <Inbox />,
  qc: <ClipboardCheck />,
  board: <LayoutGrid />,
  orders: <ListOrdered />,
  new: <Plus />,
  work: <Briefcase />,
  messages: <MessageSquare />,
  billing: <Wallet />,
  wallet: <Wallet />,
  files: <FileText />,
  earnings: <Banknote />,
  clients: <Building2 />,
  access: <KeyRound />,
  applications: <UserPlus />,
  leads: <Magnet />,
  settings: <Settings />,
  account: <User />,
};

export const navIcon = (key: string) => ICON[key] ?? <Inbox />;

const GROUPS: Record<string, [string | undefined, string[]][]> = {
  staff: [
    ["Work", ["queue", "orders", "messages", "new"]],
    ["Money", ["billing"]],
    ["People", ["clients", "access", "applications", "leads"]],
    ["System", ["settings"]],
  ],
  podLead: [
    ["Work", ["qc", "board", "orders", "new"]],
    ["Inbox", ["messages"]],
    ["Money", ["earnings"]],
  ],
  client: [
    [undefined, ["home", "orders", "new", "messages"]],
    ["Your account", ["wallet", "files"]],
  ],
  designer: [[undefined, ["home", "work", "messages", "earnings"]]],
};

/**
 * The main lists each role moves between (Phase 12). Their links are
 * prefetched in full while on screen, so a tab opens from memory. Only pages
 * that read and never write while rendering belong here: a prefetch renders
 * the page on the server without anyone looking at it (so not the review
 * page, which records a first look, nor Access, which records lookups).
 */
const PREFETCH = new Set(["/home", "/orders", "/messages", "/files", "/work", "/work/earnings", "/qc", "/qc/orders", "/qc/earnings", "/pod/board", "/admin", "/admin/orders"]);
export const prefetchTab = (href: string): true | undefined => (PREFETCH.has(href) ? true : undefined);

export type ShellKind = "staff" | "podLead" | "client" | "designer";

export function shellKind(role: string): ShellKind {
  if (role === "OPS" || role === "SALES" || role === "FINANCE") return "staff";
  if (role === "QC") return "podLead";
  if (role === "DESIGNER") return "designer";
  return "client";
}

const toItem = (t: Tab): NavItem => ({ key: t.key, label: t.label, href: t.href, icon: navIcon(t.key) });

export function sidebarGroups(kind: ShellKind, tabs: Tab[]): NavGroup[] {
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const used = new Set<string>(["account"]);
  const groups = GROUPS[kind]!.map(([label, keys]) => {
    const items = keys.flatMap((k) => (byKey.has(k) ? [toItem(byKey.get(k)!)] : []));
    items.forEach((i) => used.add(i.key));
    return { label, items };
  }).filter((g) => g.items.length > 0);
  // Anything a role gains later still shows, in its own group.
  const rest = tabs.filter((t) => !used.has(t.key)).map(toItem);
  return rest.length ? [...groups, { label: "More", items: rest }] : groups;
}

/**
 * The phone's bar: the first two destinations, a raised Create button where
 * the role creates orders, Messages, and More (everything else).
 */
export function bottomBar(kind: ShellKind, tabs: Tab[]) {
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const pick = (keys: string[]) => keys.flatMap((k) => (byKey.has(k) ? [toItem(byKey.get(k)!)] : []));
  const messages: NavItem = byKey.has("messages") ? toItem(byKey.get("messages")!) : { key: "messages", label: "Messages", href: "/messages", icon: navIcon("messages") };
  const primary =
    kind === "staff" ? pick(["queue", "orders"]) : kind === "podLead" ? pick(["qc", "board"]) : kind === "client" ? pick(["home", "orders"]) : pick(["home", "work"]);
  const create = byKey.get("new");
  const visible = kind === "designer" ? [...primary, messages, ...pick(["earnings"])] : [...primary, messages];
  const shown = new Set(visible.map((v) => v.key));
  if (create) shown.add("new");
  const more = tabs.filter((t) => !shown.has(t.key)).map(toItem);
  return { visible, create: create ? { href: create.href, label: create.label } : undefined, more };
}

export const ROLE_LABEL: Record<ShellKind, string> = {
  staff: "Admin",
  podLead: "Pod lead",
  client: "Client",
  designer: "Designer",
};
