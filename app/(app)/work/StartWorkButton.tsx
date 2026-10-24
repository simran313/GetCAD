import { Button } from "@/components/ui/button";

import { transitionAction } from "../orders/actions";

/** Start work (ASSIGNED or a sent-back version → IN_PROGRESS); starts the designer's clock. */
export function StartWorkButton({ orderId, size = "sm" }: { orderId: string; size?: "sm" | "default" }) {
  return (
    <form action={transitionAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to_status" value="IN_PROGRESS" />
      <Button type="submit" size={size}>
        Start work
      </Button>
    </form>
  );
}
