import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link that loads its page the moment a finger or the pointer lands on it
 * (Phase 12): on a phone a tap starts about a tenth of a second before it
 * ends, at a desk the pointer rests on a row before the click. The page is
 * then shown from memory. Next's App Router link does this with
 * `unstable_dynamicOnHover` (touchstart counts); its published types do not
 * list the prop yet, so it is set here, in one place.
 *
 * Only for pages that read and never write while rendering: an order, a job,
 * a conversation. A recorded lookup (Access) or the first look at a design
 * (review) must not be loaded by a pointer passing over it.
 */
export function IntentLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} {...{ unstable_dynamicOnHover: true }} />;
}
