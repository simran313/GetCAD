"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Copy, MoreHorizontal, Search, ShieldOff, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyableID } from "@/components/ui/copyable-id";
import { ResponsiveDataList, type Column } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { setUserRoleAction, setUserStatusAction } from "./actions";

/**
 * Access, interactive half (redesign A4). Tabs with counts, instant search,
 * the role changed right in the row (one step, confirmed by a toast), and
 * Suspend tucked into the row's menu behind a typed confirmation. Raw IDs sit
 * behind a copy button. The database still decides every change.
 */
export interface AccessRow {
  id: string;
  reference: string | null;
  email: string | null;
  name: string | null;
  role: string;
  extraRoles: string[];
  status: string;
  activity: string;
  you: boolean;
}

export const ROLE_LABEL: Record<string, string> = {
  CLIENT: "Client",
  DESIGNER: "Designer",
  QC: "Pod lead",
  OPS: "Ops",
  SALES: "Sales",
  FINANCE: "Finance",
};
const ROLES = ["CLIENT", "DESIGNER", "QC", "OPS", "SALES", "FINANCE"];
const STAFF = new Set(["OPS", "SALES", "FINANCE"]);

const TABS: [string, string, (r: AccessRow) => boolean][] = [
  ["all", "All", () => true],
  ["clients", "Clients", (r) => r.role === "CLIENT"],
  ["designers", "Designers", (r) => r.role === "DESIGNER"],
  ["leads", "Pod leads", (r) => r.role === "QC"],
  ["admins", "Admins", (r) => STAFF.has(r.role)],
];

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const failed = (e: unknown) => (e instanceof Error && e.message ? e.message : "the database refused it");
const label = (r: AccessRow) => r.reference ?? r.email ?? "this account";

function RoleSelect({ row }: { row: AccessRow }) {
  const [role, setRole] = useState(row.role);
  const [pending, start] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      aria-label={`Role for ${label(row)}`}
      className="w-full md:w-40"
      onChange={(e) => {
        const next = e.target.value;
        const before = role;
        setRole(next);
        start(async () => {
          try {
            await setUserRoleAction(fd({ user_id: row.id, role: next }));
            toast(`${label(row)} is now ${ROLE_LABEL[next] ?? next}`);
          } catch (err) {
            setRole(before);
            toast(`Role not changed: ${failed(err)}`, "danger");
          }
        });
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  );
}

function RowMenu({ row, onSuspend, onReinstate }: { row: AccessRow; onSuspend: () => void; onReinstate: () => void }) {
  const item = "flex h-[var(--ctl-sm)] w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 text-[length:var(--fs-2)] outline-none data-[highlighted]:bg-accent";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`More for ${label(row)}`}
        className="inline-flex h-[var(--ctl-icon)] w-[var(--ctl-icon)] shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--border-strong)] bg-background text-muted-foreground hover:bg-accent hover:text-foreground md:border-transparent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-[var(--r-md)] border border-border bg-background p-1 shadow-[var(--e-2)]">
          <Menu.Item className={item} onSelect={() => navigator.clipboard?.writeText(row.id).then(() => toast("Account ID copied"), () => {})}>
            <Copy className="h-4 w-4" /> Copy account ID
          </Menu.Item>
          {!row.you && (
            <>
              <Menu.Separator className="my-1 h-px bg-border" />
              {row.status === "SUSPENDED" ? (
                <Menu.Item className={item} onSelect={onReinstate}>
                  <ShieldCheck className="h-4 w-4" /> Reinstate
                </Menu.Item>
              ) : (
                <Menu.Item className={item} onSelect={onSuspend}>
                  <ShieldOff className="h-4 w-4" /> Suspend…
                </Menu.Item>
              )}
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AccessTable({ rows, initialQuery, initialTab, searchHint }: { rows: AccessRow[]; initialQuery: string; initialTab: string; searchHint: string }) {
  const [tab, setTab] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : "all");
  const [q, setQ] = useState(initialQuery);
  const [suspending, setSuspending] = useState<AccessRow | null>(null);
  const [, start] = useTransition();

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , f]) => [k, rows.filter(f).length])), [rows]);
  const needle = q.trim().toLowerCase();
  const inTab = TABS.find(([k]) => k === tab)![2];
  const shown = rows.filter(
    (r) => inTab(r) && (!needle || [r.reference, r.email, r.name, r.id].some((s) => s?.toLowerCase().includes(needle))),
  );

  const setStatus = (row: AccessRow, status: "ACTIVE" | "SUSPENDED") =>
    start(async () => {
      try {
        await setUserStatusAction(fd({ user_id: row.id, status }));
        toast(status === "SUSPENDED" ? `${label(row)} is suspended` : `${label(row)} is active again`);
      } catch (err) {
        toast(`Not changed: ${failed(err)}`, "danger");
      }
    });

  const columns: Column<AccessRow>[] = [
    {
      key: "person",
      header: "Person",
      card: "title",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{r.email ?? r.reference ?? "No reference yet"}</span>
            {r.you && <span className="shrink-0 rounded-[var(--r-full)] bg-muted px-2 text-[length:var(--fs-1)] leading-5 text-muted-foreground">You</span>}
          </span>
          {r.name && <span className="block truncate text-[length:var(--fs-2)] font-normal text-muted-foreground">{r.name}</span>}
        </span>
      ),
    },
    {
      key: "ref",
      header: "Reference",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="flex flex-col items-start">
          {r.email && r.reference && <span className="tabular font-mono text-[length:var(--fs-2)]">{r.reference}</span>}
          <CopyableID value={r.id} label="account ID" className="-ml-1.5" />
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      card: "hidden",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <RoleSelect row={r} />
          {r.extraRoles.map((x) => (
            <span key={x} className="rounded-[var(--r-full)] border border-border px-2 text-[length:var(--fs-1)] leading-5 text-muted-foreground">
              + {ROLE_LABEL[x] ?? x}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      card: "badge",
      cell: (r) =>
        r.status === "ACTIVE" ? (
          <StatusPill tone="success">Active</StatusPill>
        ) : r.status === "SUSPENDED" ? (
          <StatusPill tone="attention">Suspended</StatusPill>
        ) : (
          <StatusPill tone="neutral">Pending</StatusPill>
        ),
    },
    { key: "activity", header: "Activity", className: "whitespace-nowrap text-[length:var(--fs-2)] text-muted-foreground", cell: (r) => r.activity },
    {
      key: "menu",
      header: <span className="sr-only">Manage</span>,
      card: "action",
      align: "right",
      className: "w-[1%]",
      cell: (r) => (
        <span className="flex items-center justify-end gap-2">
          <span className="flex-1 md:hidden">
            <RoleSelect row={r} />
          </span>
          <RowMenu row={r} onSuspend={() => setSuspending(r)} onReinstate={() => setStatus(r, "ACTIVE")} />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Accounts" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex min-w-max gap-5">
            {TABS.map(([k, name]) => (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "inline-flex min-h-[var(--ctl-sm)] items-center gap-2 whitespace-nowrap border-b-2 text-[length:var(--fs-3)]",
                    tab === k ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name}
                  <span className="tabular rounded-[var(--r-full)] bg-muted px-1.5 text-[length:var(--fs-1)] leading-5 text-muted-foreground">{counts[k]}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <label className="relative mb-3 block sm:w-80">
          <span className="sr-only">Search accounts</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchHint} className="pl-9" />
        </label>
      </div>

      <ResponsiveDataList
        caption="Accounts"
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        empty={
          <div className="rounded-[var(--r-lg)] border border-border bg-card shadow-[var(--e-1)]">
            <EmptyState
              icon={needle ? <Search /> : <Users />}
              title={needle ? "No accounts match" : "No accounts here yet"}
              description={needle ? "Try part of an email or a shorter reference." : "Accounts appear here once someone signs up or is invited."}
            />
          </div>
        }
      />

      <ConfirmDialog
        open={!!suspending}
        onOpenChange={(o) => !o && setSuspending(null)}
        title={`Suspend ${suspending ? label(suspending) : ""}?`}
        description="Suspend, never delete: their orders, files and history stay as they are. You can reinstate them from the same menu."
        typed="suspend"
        destructive
        confirmLabel="Suspend account"
        onConfirm={() => suspending && setStatus(suspending, "SUSPENDED")}
      />
    </div>
  );
}
