# Bundle Gap Analysis — 2026-04-22

## Scope

This note compares the current repo state against Bundle 01-04 expectations and the live Supabase project connected through MCP.

## Supabase status

- Live migration history includes `20260422142631_backfill_cm_assignments_from_account_manager` in addition to the bundle 04 schema migrations through `20260422223000_admin_create_customer`.
- Live objects confirmed:
  - `v_admin_billing_mrr`
  - `v_admin_invoices`
  - `v_admin_subscriptions`
  - `v_admin_payroll_period`
  - `admin_convert_demo_to_customer`
  - `admin_create_customer`
- This means several repo-side runtime fallbacks are now technical debt, not necessary compatibility code.

## Bundle 01

- Customer detail route split appears to be in place under `app/src/app/admin/customers/[id]/*`.
- Route handlers for customer actions exist under `app/src/app/api/admin/customers/[id]/*`.
- Remaining risk:
  - parallel route layouts around customer billing/subscription had App Router typing drift and needed correction.

## Bundle 02

- Billing has been split into nested routes under `app/src/app/admin/billing/*`.
- Team and overview domains have been extracted into dedicated routes/components/hooks.
- Known guide erratum about TanStack Router primitives has been neutralized in code and dependency graph; the unused router/start packages were removed from `app/package.json`.
- Remaining risks:
  - verify no generated route snippets still assume non-Next router conventions.
  - verify team/payroll/customer modal route structure after typecheck is green.

## Bundle 03

- Shared API client, query keys, DTO/Zod layers, slim billing routes, and overview/team aggregations are present.
- `docs/migrations.md` already maps most schema dependencies to concrete migrations.
- Closed in this pass:
  - unit test coverage is isolated to unit files in `vitest`, so Playwright specs no longer poison `test:unit`.
  - attention sorting now matches expected priority order for urgent notifications vs overdue invoices.
  - payroll now reads the migrated relational/view model directly instead of falling back to legacy Node-side schema paths.
  - live data was backfilled so non-archived customers now have active `cm_assignments`.

## Bundle 04

- Supporting flows are largely present:
  - demos board and dialogs
  - settings page
  - payroll screen
  - audit log screen/export route
  - add team member flow
- Closed in this pass:
  - demo dialogs were remounted per open-session instead of resetting state inside effects.
  - convert/create demo paths are now covered by green `typecheck`, `lint`, `vitest`, and `next build`.
  - team/payroll supporting flows now depend on the migrated ownership model instead of compatibility heuristics.

## Verification

1. `npm run typecheck`
2. `npm run lint -- --quiet`
3. `npm run test:unit`
4. `npm run build`
