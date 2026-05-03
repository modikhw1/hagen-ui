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
- **Auth**: Supabase Auth (`@supabase/ssr`)  — env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
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
- `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*`
- Server components/actions → `// @ts-nocheck` suppressed; 113 of 942 files have it
- Server component pages (async params) → converted to client components using `useParams()` + `useSearchParams()`
- `customers/[id]/page.tsx` and `customers/[id]/avtal/page.tsx` fully converted to client-side with data mapping from `useCustomerDetail`, `useCustomerInvoices`, `useCustomerDrift` hooks
- vite.config.ts aliases: `stripe`, `next/cache`, `next/server`, `next/navigation`, `next/headers`, `next/image`
- tsconfig.json excludes server-only lib files from type checking

## Key Files

- `artifacts/letrend/src/App.tsx` — main router (wouter); all admin + studio routes registered
- `artifacts/letrend/src/lib/navigation-compat.ts` — Next.js navigation shims
- `artifacts/letrend/src/stubs/next-image.tsx` — img stub
- `artifacts/letrend/vite.config.ts` — aliases, path rewrites
- `artifacts/letrend/src/lib/supabase/client.ts` — Supabase browser client (import.meta.env)
- `artifacts/api-server/src/routes/index.ts` — Express routes (health only; admin API routes TBD)

## Key Commands

- `pnpm --filter @workspace/letrend run dev` — run frontend locally
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/letrend exec tsc --noEmit` — typecheck frontend (0 errors)

## Admin Routes (registered in App.tsx)

```
/admin                          → overview
/admin/customers                → customer list
/admin/customers/:id            → CustomerDriftRoute (overview + pulse)
/admin/customers/:id/avtal      → CustomerAvtalRoute (billing + org + ops)
/admin/customers/:id/organisation
/admin/customers/:id/pulse
/admin/customers/:id/subscription[/price]
/admin/customers/:id/team[/change]
/admin/billing[/health][/invoices][/subscriptions]
/admin/billing/invoices/:invoiceId
/admin/settings[/*]
/admin/team[/*]
```

## Environment Variables Needed

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `VITE_API_URL` | API server base URL (if separate from frontend) |
| `VITE_POSTHOG_KEY` | PostHog analytics |
| `VITE_SENTRY_DSN` | Sentry error tracking |

## TODO / Remaining Work

1. **Set Supabase env vars** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for auth to work
2. **Express API routes** — wire up admin API endpoints (customers, billing, invoices, etc.) to Express router in `artifacts/api-server/src/routes/`; currently only `/health` exists
3. **CustomerDriftRoute data** — `/api/admin/customers/:id/drift` endpoint needed for full overview+pulse data
4. **New billing API endpoints** — billing/drift, billing/recent-events, billing/reconcile, billing/upcoming, customers/:id/balance, invoices/:id/actions+timeline
5. **Server action files** — 113 files have `@ts-nocheck`; some server actions in `src/app/admin/_actions/` need client-side API equivalents
