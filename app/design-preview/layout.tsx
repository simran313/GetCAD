import { notFound } from "next/navigation";

/**
 * The design preview is a working reference for the team (sample copy,
 * unconfirmed claims). Preview builds and local runs show it; the production
 * deployment answers 404 (Phase 11b).
 */
export default function DesignPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") notFound();
  return children;
}
