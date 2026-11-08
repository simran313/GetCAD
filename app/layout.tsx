import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import localFont from "next/font/local";

import { ServiceWorker } from "@/components/pwa/service-worker";

import "./globals.css";

// Self-hosted rather than fetched from Google at build time: the build must not
// depend on an outbound request succeeding, and the fonts must not be requested
// from a third party at runtime by a page that shows people's order data.

// Geist and Geist Mono as the geist package defines them, from copies cut
// down to the characters and typographic features the product uses
// (scripts/subset-fonts.sh: Latin and Latin-1, punctuation, currency incl. ₹,
// arrows; ~30 KB and ~24 KB instead of ~70 KB each). On a phone every byte
// before the first paint delays it. Mono is not preloaded: it sets only small
// labels and references, and loads when a page first uses it.
const GeistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const GeistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  weight: "100 900",
  preload: false,
});

export const metadata: Metadata = {
  // Absolute URLs for canonical and Open Graph tags resolve against the site.
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "The CAD Pillar",
    template: "%s | The CAD Pillar",
  },
  description: SITE_DESCRIPTION,
  // Google Search Console's HTML-tag verification, when the owner sets the
  // token (DNS verification needs nothing here).
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
  // Safari largely ignores the manifest and reads these instead, so an
  // installed iOS app takes its name and status-bar treatment from here.
  appleWebApp: {
    capable: true,
    title: "CAD Pillar",
    // "default" (owner report, 6 Nov 2026): a dark status bar text on its
    // own white band. "black-translucent" drew the page under the status
    // bar with white text, so on our white app the clock and battery were
    // invisible and the top bar's buttons sat under the Dynamic Island.
    statusBarStyle: "default",
  },
  // The black pillar icons (2 Nov 2026) have new file names on purpose:
  // browsers and phones keep a favicon or app icon cached by its address, so
  // only a new address replaces the old blue icon.
  icons: {
    icon: [
      { url: "/pillar-favicon.svg", type: "image/svg+xml" },
      { url: "/pillar-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/pillar-apple-touch-180.png", sizes: "180x180" }],
  },
};

/**
 * `viewportFit: "cover"` lets the page paint into the display cutout area,
 * which is what makes `env(safe-area-inset-*)` return anything but zero — the
 * bottom tab bar depends on it to clear the home indicator.
 *
 * `maximumScale` is left alone on purpose. Capping it stops pinch-zoom, which
 * is a genuine accessibility regression, and the usual reason for adding it
 * (iOS zooming on focused inputs) is solved by not using type smaller than
 * 16px in form fields.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Light only (Phase 5): the installed app's bars match the white portal.
  themeColor: "#ffffff",
};

// Minimal shell: fonts + globals only. The marketing site and the
// authenticated product each provide their own header/nav via a nested layout
// in their respective route group — this root never renders chrome specific
// to either, keeping the two structurally isolated. Clerk is loaded by the
// layouts that use it (components/auth/auth-provider), not here.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
