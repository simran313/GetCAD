"use client";

import { useState, useTransition } from "react";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

import { setAccountManagerAction } from "../actions";

/**
 * A client's account manager, saved the moment it changes (redesign: no
 * per-row Save). A toast confirms; if the database refuses, the choice rolls
 * back and says why.
 */
export function ManagerSelect({
  clientId,
  clientCode,
  managerId,
  managers,
}: {
  clientId: string;
  clientCode: string | null;
  managerId: string | null;
  managers: { user_id: string; first_name: string | null }[];
}) {
  const [value, setValue] = useState(managerId ?? "");
  const [pending, start] = useTransition();
  const name = (id: string) => managers.find((m) => m.user_id === id)?.first_name ?? "a team member";
  return (
    <Select
      value={value}
      disabled={pending}
      aria-label={`Account manager for ${clientCode ?? "client"}`}
      className="w-full md:w-44"
      onChange={(e) => {
        const next = e.target.value;
        const before = value;
        setValue(next);
        start(async () => {
          const f = new FormData();
          f.set("client_id", clientId);
          f.set("manager_id", next);
          try {
            await setAccountManagerAction(f);
            toast(next ? `${clientCode ?? "Client"} is now looked after by ${name(next)}` : `${clientCode ?? "Client"} has no account manager`);
          } catch (err) {
            setValue(before);
            toast(`Not changed: ${err instanceof Error && err.message ? err.message : "the database refused it"}`, "danger");
          }
        });
      }}
    >
      <option value="">Unassigned</option>
      {managers.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.first_name}
        </option>
      ))}
    </Select>
  );
}
