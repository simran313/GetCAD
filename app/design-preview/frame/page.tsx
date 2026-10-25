import type { Metadata } from "next";

import { ClientSample, MarketingSample, PortalSample } from "../samples";

export const metadata: Metadata = { title: "Design preview frame", robots: { index: false, follow: false } };

/** One sample screen, for the preview's 390 / 1440 frames. */
export default async function Frame({ searchParams }: { searchParams: Promise<{ view?: string; font?: string }> }) {
  const { view = "marketing", font = "a" } = await searchParams;
  if (view === "portal") return <PortalSample />;
  if (view === "client") return <ClientSample />;
  return <MarketingSample font={font === "b" ? "b" : "a"} />;
}
