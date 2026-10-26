import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { choosePodAction } from "@/app/(app)/admin/actions";

export interface PodOption {
  pod_id: string;
  name: string;
  lead_id: string | null;
  lead_name: string | null;
}

/** "Choose a pod" — by its pod lead, as assign_order_pod() takes it. */
export function PodPicker({
  orderId,
  pods,
  label = "Move",
  variant = "default",
}: {
  orderId: string;
  pods: PodOption[];
  label?: string;
  /** The queue shows every row's move as a secondary button. */
  variant?: "default" | "secondary";
}) {
  const usable = pods.filter((p) => p.lead_id);
  if (usable.length === 0) {
    return <span className="text-[length:var(--fs-2)] text-muted-foreground">No pod has a lead yet · Access → Pods</span>;
  }
  return (
    <form action={choosePodAction} className="flex w-full items-center gap-2 md:w-auto">
      <input type="hidden" name="order_id" value={orderId} />
      <Select name="lead_id" required defaultValue="" aria-label="Pod" className="min-w-0 flex-1 md:w-auto md:flex-none">
        <option value="" disabled>
          Choose a pod…
        </option>
        {usable.map((p) => (
          <option key={p.pod_id} value={p.lead_id!}>
            {p.name}
            {p.lead_name ? ` · ${p.lead_name}` : ""}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
