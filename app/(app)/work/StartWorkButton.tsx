import { Button } from "@/components/ui/button";

import { transitionAction } from "../orders/actions";

/** Start work (ASSIGNED or a sent-back version → IN_PROGRESS); starts the designer's clock. */
export function StartWorkButton({
  orderId,
  size = "sm",
  variant = "default",
}: {
  orderId: string;
  size?: "sm" | "default";
  variant?: "default" | "secondary";
}) {
  return (
    <form action={transitionAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to_status" value="IN_PROGRESS" />
      <Button type="submit" size={size} variant={variant}>
        Start work
      </Button>
    </form>
  );
}
