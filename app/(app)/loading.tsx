import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Every portal screen without a loading state of its own (Phase 11a): a
 * click shows this at once, prefetched with the link, while the server
 * answers, instead of nothing happening until the new page arrives.
 */
export default function PortalLoading() {
  return <PageSkeleton rows={4} />;
}
