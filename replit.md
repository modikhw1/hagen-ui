# Workspace

## Overview

pnpm workspace monorepo using TypeScript. LeTrend is a Swedish influencer/content marketing SaaS migrated from Vercel/Next.js to Vite + React (Replit). Each package manages its own dependencies.

## Artifacts

| Artifact | Kind | Dir | Preview |
|---|---|---|---|
| LeTrend | web (Vite + React) | `artifacts/letrend` | `/` |
| API Server | api (Express 5) | `artifacts/api-server` | — |
| Canvas | design (mockup sandbox) | `artifacts/mockup-sandbox` | `/mockup-sandbox` |

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: Vite 6 + React 18 + Mantine UI v7 + wouter (routing)
- **Auth**: Supabase Auth (`@supabase/ssr`) — env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Payments**: Stripe (client-side hooks) — env var: `VITE_STRIPE_PUBLISHABLE_KEY`
- **State/Query**: TanStack Query v5
- **Forms**: react-hook-form + Zod + @hookform/resolvers
- **Rich text**: TipTap
- **DnD**: @dnd-kit
- **Analytics**: PostHog, Sentry
- **API framework**: Express 5
- **Build**: Vite (frontend), esbuild (API server)

## Migration Notes (Next.js → Vite)

- `next/navigation` → `@/lib/navigation-compat` (exports useRouter, useSearchParams, usePathname, useParams, redirect, permanentRedirect, notFound)
- `next/link` → wouter `Link` with `to=` instead of `href=`, no `prefetch` prop
- `next/image` → aliased to `src/stubs/next-image.tsx` (renders plain `<img>`)
- `server-only` → aliased to `src/stubs/server-only.ts` (no-op export)
- `next/cache`, `next/server`, `next/headers` → no-op stubs in `src/stubs/`
- `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*`
- All pages in `app/` are `'use client'` React components using `useParams()` — no async server components remain
- No `'use server'` directives outside `_actions/` (which are unused at runtime — replaced by Express routes)
- `createSupabaseAdmin` only in server-side libs — no client pages import it directly
- vite.config.ts aliases: `stripe`, `server-only`, `next/cache`, `next/server`, `next/navigation`, `next/headers`, `next/image`

## Key Files

- `artifacts/letrend/src/App.tsx` — main router (wouter); all admin + studio routes registered
- `artifacts/letrend/src/lib/navigation-compat.ts` — Next.js navigation shims
- `artifacts/letrend/src/stubs/` — browser-safe stubs for server-only Next.js modules
- `artifacts/letrend/vite.config.ts` — aliases, path rewrites
- `artifacts/letrend/src/lib/supabase/client.ts` — Supabase browser client (import.meta.env)
- `artifacts/letrend/src/lib/admin/api-client.ts` — authenticated apiClient for Express API
- `artifacts/api-server/src/routes/admin/index.ts` — main admin router wiring all subrouters
- `artifacts/api-server/src/routes/admin/demos.ts` — includes POST /:id/prepare-studio

## Converted Pages Summary

All pages fully converted to `'use client'` React components:

| Page | Conversion |
|---|---|
| `admin/page.tsx` | `useAdminOverview` hook |
| `admin/customers/page.tsx` | `useCustomerList` hook |
| `admin/customers/[id]/layout.tsx` | `useCustomerDetail` hook, inline header JSX |
| `admin/customers/[id]/billing/@modal/*` | `useParams()` → renders modal route components |
| `admin/customers/[id]/avtal/*` | `useParams()` → redirect or render |
| `admin/customers/[id]/subscription/@modal/*` | `useParams()` → redirect |
| `admin/customers/[id]/team/@modal/*` | `useParams()` → redirect |
| `admin/team/page.tsx` | `useAdminTeam` hook |
| `admin/demos/page.tsx` | `useDemosBoard` hook |
| `admin/billing/health/page.tsx` | `useBillingHealth` hook |
| `admin/(ops)/audit-log/page.tsx` | `useAuditLog` hook |
| `admin/(ops)/payroll/page.tsx` | `usePayroll` hook |
| `admin/(ops)/settings/page.tsx` | `useAdminSettings` hook |
| `d/[token]/page.tsx` | Client-side Supabase fetch |
| `demo/[customerId]/page.tsx` | Client-side Supabase browser client fetch |
| `m/page.tsx` | `URLSearchParams(window.location.search)` → redirect |
| 12 redirect-only pages | `useParams()` + `useEffect` + `router.replace()` |

## Express API Routes

All mounted at `/api/admin/` in `artifacts/api-server/src/routes/admin/`:

| File | Routes |
|---|---|
| `customers.ts` | CRUD + drift + pulse + activity + absences + snooze |
| `team.ts` | team list/lite + absences + create + handover cancel/reschedule |
| `billing.ts` | health + invoices + subscriptions + upcoming + reconcile |
| `demos.ts` | board + CRUD + **POST /:id/prepare-studio** |
| `audit.ts` | audit log list |
| `payroll.ts` | payroll data |
| `settings.ts` | settings read/write |
| `invoices.ts` | invoice list + actions |
| `subscriptions.ts` | subscription list + actions |
| `tiktok.ts` | TikTok profile + sync |
| `notifications.ts` | notification endpoints |

## Key Commands

- `pnpm --filter @workspace/letrend run dev` — run frontend locally
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/letrend exec tsc --noEmit` — typecheck frontend (0 errors)
- `pnpm --filter @workspace/api-server exec tsc --noEmit` — typecheck API server (0 errors)

## Environment Variables Needed

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `VITE_API_URL` | API server base URL (if separate from frontend) |
| `VITE_POSTHOG_KEY` | PostHog analytics |
| `VITE_SENTRY_DSN` | Sentry error tracking |
| `SUPABASE_URL` | API server Supabase URL (service role) |
| `SUPABASE_SERVICE_ROLE_KEY` | API server service role key |
| `STRIPE_SECRET_KEY` | API server Stripe secret key |

## TODO / Remaining Work

1. **Set env vars** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`
2. **Wire API proxy** — configure Vite dev proxy or deploy API server so `/api/*` calls reach the Express server
3. **RLS policies** — `demo/[customerId]` uses anon Supabase client; ensure `customer_profiles` RLS allows public demo reads
4. **`_actions/` cleanup** — server action files in `src/app/admin/_actions/` are dead code (replaced by Express routes); can be removed once confident
