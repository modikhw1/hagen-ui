# LeTrend — Replit Monorepo

> **This is the canonical, actively maintained repository for LeTrend.**
> The project was migrated from Vercel / Next.js to this Replit pnpm monorepo (Vite + React + Express). All new development happens here.

---

## What is LeTrend?

LeTrend is a Swedish influencer content-marketing SaaS. It provides:

- An **admin portal** for internal staff to manage customers, billing (Stripe), concepts, game plans, and team operations.
- A **Studio** surface (content-manager view) for planning influencer content per customer.
- A **customer portal** for influencers to view their feed plan, invoices, and game plan.
- A **mobile-optimised** customer view for on-the-go access.

---

## Architecture

```
workspace/                          ← pnpm monorepo root
├── artifacts/
│   ├── letrend/                    ← Frontend (Vite + React 18 + wouter)
│   ├── api-server/                 ← Backend  (Express 5 + Supabase Admin)
│   ├── mockup-sandbox/             ← Design canvas / component preview server
│   └── hagen/                      ← Read-only mirror of Hagen ingestion source
├── packages/                       ← Shared TypeScript packages (if any)
├── replit.md                       ← Agent memory / architecture notes
└── README.md                       ← This file
```

### Frontend — `artifacts/letrend`

| Detail | Value |
|---|---|
| Framework | Vite 7 + React 18 |
| Router | wouter (replaces Next.js `app/` routing) |
| UI | Mantine v7 (being phased out of admin surfaces) + Tailwind CSS |
| Design tokens | `src/styles/letrend-design-system.ts`, `src/components/admin/ui/adminModalTokens.ts` |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Data fetching | TanStack Query v5 |
| Forms | react-hook-form + Zod |
| Rich text | TipTap |
| DnD | @dnd-kit |
| Testing | Vitest (unit), Playwright (e2e) |

### Backend — `artifacts/api-server`

| Detail | Value |
|---|---|
| Framework | Express 5 |
| Database | Supabase (PostgreSQL) via `SUPABASE_DB_URL` |
| Payments | Stripe (server-side SDK) |
| Email | Resend |
| Build | esbuild |

---

## Migration from Vercel / Next.js

The codebase was fully migrated off Next.js. Key shims:

| Next.js | Replacement |
|---|---|
| `next/navigation` | `@/lib/navigation-compat` |
| `next/link` | wouter `<Link to=…>` |
| `next/image` | `src/stubs/next-image.tsx` (plain `<img>`) |
| `server-only` | `src/stubs/server-only.ts` (no-op) |
| `process.env.NEXT_PUBLIC_*` | `import.meta.env.VITE_*` |
| Next.js API routes (`app/api/`) | Express routes in `artifacts/api-server` |
| `'use server'` actions | Express PATCH/POST endpoints via `apiClient` |

No `app/api/` route handlers, no `'use server'` directives, and no async server components remain.

---

## Recent Significant Changes

| Task | Summary |
|---|---|
| **#48** | Removed "Till kundarbete" back-link, "Aktiv del" header card, and redundant `<h2>` headings from the customer workspace. |
| **#49** | Applied unified admin modal design tokens (`ADMIN_MODAL_INPUT_CLS`, `ADMIN_MODAL_LABEL_CLS`) across all `AdminFormDialog`-based modals. |
| **#50** | Replaced all Mantine form components (Radio, Select, NumberInput, TextInput, Textarea) in `CreditReissueWizard` with warm-token native HTML elements — no more blue Mantine accents in the credit/refund wizard. |
| **#51** | Spacing cleanup after workspace header removal: right column `paddingTop: 4`, outer wrapper `paddingBottom: 40`. |
| **#44–#47** | Normalized concept boundary shape (`normalizeStudioCustomerConcept`), cache-key bump, and Vitest regression test suite. |

---

## Running Locally (on Replit)

```bash
# Frontend
pnpm --filter @workspace/letrend run dev

# API server
pnpm --filter @workspace/api-server run dev

# Typecheck
pnpm --filter @workspace/letrend exec tsc --noEmit
pnpm --filter @workspace/api-server exec tsc --noEmit

# Unit tests
pnpm --filter @workspace/letrend run test
```

---

## Environment Variables

### Frontend (`artifacts/letrend`) — all prefixed `VITE_`

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe client-side key |
| `VITE_API_URL` | Optional | API base URL (defaults to same origin) |
| `VITE_POSTHOG_KEY` | Optional | PostHog analytics |
| `VITE_SENTRY_DSN` | Optional | Sentry error tracking |

### API Server (`artifacts/api-server`)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `SUPABASE_DB_URL` | ✅ | Direct Postgres connection string |
| `STRIPE_SECRET_KEY` | ✅ | Stripe live/test secret key |
| `STRIPE_WEBHOOK_SECRET` | Optional | Webhook signature verification |
| `HAGEN_BASE_URL` | Optional | Hagen API proxy URL |
| `HAGEN_API_KEY` | Optional | Hagen API auth key |
| `RESEND_API_KEY` | Optional | Email sending |
| `JWT_SECRET` | Optional | JWT signing |

---

## Key Source Files

| File | Purpose |
|---|---|
| `artifacts/letrend/src/App.tsx` | Main wouter router — all admin, studio, and customer routes |
| `artifacts/letrend/src/styles/letrend-design-system.ts` | Brand colour tokens (`LeTrendColors`) |
| `artifacts/letrend/src/components/admin/ui/adminModalTokens.ts` | Admin modal design tokens (inputs, labels, buttons, alerts) |
| `artifacts/letrend/src/lib/studio/customer-concepts.ts` | `normalizeStudioCustomerConcept` boundary adapter |
| `artifacts/api-server/src/routes/admin/index.ts` | Admin router wiring all sub-routers |
| `artifacts/letrend/src/lib/navigation-compat.ts` | Next.js navigation shims |
