# Frontend and backend

This chapter explains how the user interface is built and served, and how the server side is organised: what runs in the browser, what runs on Vercel, and the patterns every new screen and action should follow.

## Technology stack

| Layer | Technology | Version (package.json) | Used for |
|---|---|---|---|
| Framework | Next.js App Router | 15.5.19 (`^15.3.0`) | Routing, Server Components, Server Actions, route handlers, middleware |
| UI library | React | 19.1 | Components |
| Language | TypeScript (strict) | 5.7 | All application code |
| Styling | Tailwind CSS with design tokens | 3.4 | Utility classes; tokens in `app/globals.css` |
| Primitives | Radix UI (dialog, dropdown, tabs, tooltip, accordion), cmdk | pinned | Accessible menus, dialogs and the command palette |
| Forms | react-hook-form + zod | 7.81 / 4.4 | Client-side forms and server-side validation |
| Motion | motion | 14.1 | Small transitions |
| Icons and fonts | lucide-react, Geist (self-hosted woff2 in `app/fonts`) | | Brand typography |
| Sign-in UI | `@clerk/nextjs` | 6.39 | Sign-in and sign-up pages, session, `auth()` |
| Data | `@supabase/supabase-js` | 2.108 | Database (PostgREST), Storage and Realtime |
| 3D | three.js | 0.169 | STL preview in the browser (`components/preview/stl-viewer.tsx`) |
| CAD files | rhino3dm | 8.32 | Reading `.3dm` files and exploding block instances (`lib/files/strip3dm.ts`) |
| Documents | @react-pdf/renderer, pdf-lib | 4.9 / 1.17 | Summary sheet, QC certificate, weight sheet, pod report; cleaning uploaded PDFs |
| Images | sharp | 0.34.5 | Technical-sheet panels, render composition, PDF images |
| Push | web-push | 3.6 | Phone notifications (VAPID) |

## Frontend

### Route groups and screens

The `app/` folder is the URL map. Folders in brackets, such as `(marketing)`, group routes without changing the address.

| Group | Pages | Audience |
|---|---|---|
| `(marketing)` | `/`, `/jewelry-cad`, `/how-it-works`, `/pricing`, `/guarantee`, `/quality`, `/faq`, `/contact`, `/apply-designer`, `/privacy`, `/terms`, `/results` | Everyone; no sign-in check on page views |
| `(auth)` | `/sign-in`, `/sign-up` (Clerk components) | Everyone |
| `(app)` client | `/home`, `/orders`, `/orders/new`, `/orders/[id]` and its brief, review, pay, claim and sent pages, `/messages`, `/files`, `/wallet`, `/account` | Clients (also used by the team where relevant) |
| `(app)` designer | `/work`, `/work/[id]`, `/work/[id]/checklist`, `/work/[id]/review`, `/work/earnings`, `/materials`, `/tools`, `/onboarding/designer`, `/settings/payouts` | Designers |
| `(app)` pod lead (QC) | `/qc`, `/qc/[id]`, `/qc/orders`, `/qc/earnings`, `/pod/board`, `/pod/performance`, `/pod/designers/[id]` | Pod leads |
| `(app)` admin | `/admin`, plus `access`, `access/pods`, `applications`, `billing`, `clients`, `credits`, `designers`, `designers/[id]`, `emails`, `leads`, `new-order`, `orders`, `orders/export`, `payouts`, `payouts/[batch]`, `settings`, `users` | Admins (Sales, Ops, Finance) |
| Other | `/p/[token]` (public 3D preview for a client's own customer), `/offline` (PWA fallback), `/design-preview` (component gallery) | |

The full list, with guards and files, is generated in [Appendix C](../api/generated/routes.md).

### Rendering model

- **Server Components by default.** Pages fetch their data on the server with the user-scoped Supabase client and send finished HTML. No secret, no service-role key and no other person's data ever reaches the browser.
- **Client Components only where interaction needs them**, marked `"use client"`: forms, chat composer, STL viewer, drawing on images, the render composer, the notification bell and the PWA helpers.
- **Mutations are Server Actions.** A form posts to a function marked `"use server"`. That function runs on Vercel, re-checks the caller and calls a database function. Afterwards `revalidatePath` refreshes the affected pages. Next.js also checks the request's Origin header, which protects actions against cross-site request forgery.
- **Freshness.** `next.config.mjs` keeps a page seen in the last 30 seconds in the browser's memory (`staleTimes`), so tabs switch instantly. Any server action clears it. Order and chat pages poll a small "stamp" endpoint (`/api/orders/[id]/stamp`, `/api/inbox/stamp`) to learn about changes. Live chat additionally listens to a private Realtime channel that carries only a "changed" signal, never content (`lib/supabase/live.ts`, migration `0052_chat_live.sql`).

### Design system

- Tokens (colours, surfaces, radii, the `--chrome-top` and `--chrome-bottom` safe-area offsets) are in `app/globals.css`. The brand is black and white, with near-black marks for live and selected states (DECISIONS §1).
- Components live in `components/ui` (buttons, inputs, cards, badges, tables, dialogs) and `components/shell` (portal header, navigation per role, notification centre). Every component is shown in `/design-preview`.
- The page-by-page record is `docs/redesign/BEFORE-AFTER.md`. Screenshots of every route are captured by the design-QA workflow.

### Progressive Web App

The portal installs to a phone's home screen (`app/manifest.ts`, `public/sw.js`, `components/pwa/*`). The service worker offers an offline page and handles push notifications. Fixed bars respect the iPhone status bar, Dynamic Island and home indicator through `--chrome-top` and `--chrome-bottom`; `tests/config/mobile-chrome.test.ts` forbids hard-coded pixel offsets.

## Backend

### Building blocks

| Kind | Where | Count | Pattern |
|---|---|---|---|
| Server Components (pages) | `app/**/page.tsx` | 73 | `auth()` → user client → read through RLS or visibility functions → render |
| Server Actions | `app/**/actions.ts`, `lib/client/standingActions.ts` | 92 in 31 files | `auth()` → user client → `supabase.rpc("…")` → `revalidatePath` → return a friendly result or `Refusal` |
| Route handlers | `app/api/**/route.ts` | 20 | File downloads, PDFs, stamps, health, cron, webhook (see chapter 7) |
| Middleware | `middleware.ts` | 1 | Clerk on app routes; skipped for public page views |
| Database functions | `db/migrations` | 285 | Business operations and visibility rules; 254 SECURITY DEFINER |

### The standard server action

```ts
"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { Refusal } from "@/lib/refusal";

export async function confirmOrderAction(orderId: string) {
  const { userId } = await auth();
  if (!userId) throw new Refusal("Sign in first.");          // convenience check
  const supabase = await createUserSupabaseClient();          // runs as this person
  const { error } = await supabase.rpc("confirm_order", { p_order_id: orderId });
  if (error) throw new Refusal(error.message);               // the database decided
  revalidatePath(`/orders/${orderId}`);
}
```

*Illustrative. It mirrors the shape of the real actions (for example `app/(app)/orders/actions.ts`); function names differ per feature.*

The important property: **the action does not decide whether the person may confirm the order. The database function does.** The action only translates the outcome for the screen.

### When the service role is used

`createAdminSupabaseClient()` (`lib/supabase/admin.ts`) bypasses RLS. It is imported only on the server (`server-only`) and used for four things:

1. Writing sanitised bytes to a private bucket after the upload has been authorised.
2. Minting short-lived signed upload or download URLs after the user-scoped client has proven access.
3. Trusted system work with no user: the Razorpay webhook, the cron senders, payout execution and public statistics.
4. Reading a public preview by a hashed token (`/p/[token]`).

Chapter 9 lists the 36 files that use it, and how each is guarded.

### Generated documents

| Document | Built by | Served at |
|---|---|---|
| Summary sheet (order, images, stones, weights, timeline) | `lib/pdf/summarySheet.tsx` | `/api/orders/[id]/summary` |
| QC certificate and spec sheet | `lib/pdf/certificate.tsx`, `lib/certificates/issue.ts` | `/api/orders/[id]/certificate` |
| Weight sheet (10K, 14K, 18K, Pt950, Ag925 grams) | `lib/pdf/weightSheet.tsx` | `/api/orders/[id]/weight-sheet` |
| Pod performance report | `lib/pdf/podReport.tsx` | `/api/pod/report` |
| Technical sheet panel | `lib/files/techSheet.tsx` (sharp) | joined under the uploaded technical image |

### Validation

- **Browser:** react-hook-form with zod schemas give instant feedback.
- **Server:** actions validate again (zod and explicit checks). Database functions validate a third time (enums, CHECK constraints, function guards). The database is authoritative.
- **Files:** `core/files/sanitizationGate.ts` (extension, size, magic bytes, metadata) plus format-specific cleaners: `lib/files/cleanPdf.ts` and `lib/files/strip3dm.ts`.
