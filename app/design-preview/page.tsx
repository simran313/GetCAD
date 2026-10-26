import type { Metadata } from "next";

import { Preview } from "./preview";

export const metadata: Metadata = {
  title: { absolute: "Design preview · The CAD Pillar" },
  robots: { index: false, follow: false },
};

/** Redesign step 3: every token and component, and sample screens at 390 and 1440. */
export default function DesignPreviewPage() {
  return <Preview />;
}
