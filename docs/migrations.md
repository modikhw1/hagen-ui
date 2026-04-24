# Admin Migration Map

This document maps remaining `schemaWarnings` and hard admin dependencies to the migrations that must exist in the database after Bundles 03 and 04.

## Required migrations

| Area | Runtime warning / dependency | Migration file |
| --- | --- | --- |
| Admin settings | `Settings-tabellen eller nagon av dess kolumner saknas. Kor migrationen for §2.` | `supabase/migrations/20260421123743_admin_operational_foundations.sql` |
| Audit log | `Audit-logg-tabellen saknas i databasen. Kor migrationen for §2.` | `supabase/migrations/20260421123743_admin_operational_foundations.sql` |
| Team commission | `Kolumnen team_members.commission_rate saknas i databasen...` | `supabase/migrations/20260421123743_admin_operational_foundations.sql` |
| CM assignment history | `Tabellen cm_assignments saknas i databasen...` | `supabase/migrations/20260421123743_admin_operational_foundations.sql` |
| Billing sync environment | `stripe_sync_log saknar environment-kolumn i databasen...` | `supabase/migrations/20260417010000_phase1_base_schema.sql` |
| Invoice line items | `Tabellen invoice_line_items saknas i databasen...` | `supabase/migrations/20260417010100_phase1_rls_alignment.sql` plus the existing line item schema migrations |
| Credit notes / refunds | `Tabellen stripe_credit_notes saknas i databasen.` / `Tabellen stripe_refunds saknas i databasen.` | `supabase/migrations/20260421144521_billing_adjustments_and_handover_support.sql` |
| Billing MRR view | `v_admin_billing_mrr` is required by billing/team aggregation | `supabase/migrations/20260422113000_admin_billing_mrr_view.sql` |
| Billing views | `v_admin_invoices` and `v_admin_subscriptions` are required by the thin admin routes | `supabase/migrations/20260422201000_admin_billing_views.sql` |
| Payroll view | `v_admin_payroll_period` is required by supporting flows/payroll | `supabase/migrations/20260422213000_admin_supporting_flows.sql` |
| Admin customer/team RPCs | `admin_get_customer_detail`, `admin_reassign_team_customers`, `admin_update_team_member`, `admin_convert_demo_to_customer`, `admin_create_customer` | `supabase/migrations/20260422113748_admin_bundle_catchup.sql` plus the late bundle migrations |
| Admin idempotency / locks | `admin_idempotency_keys`, `admin_customer_action_locks` | `supabase/migrations/20260422113748_admin_bundle_catchup.sql` plus the late bundle migrations |
| Admin scopes | `admin_role` explicit billing/team/overview scopes | `supabase/migrations/20260422152000_admin_scope_enums.sql` |
| CM assignment truth | active `cm_assignments` rows must exist for non-archived customers so team/payroll can rely on relational ownership | `supabase/migrations/20260422142631_backfill_cm_assignments_from_account_manager.sql` |

## Bundle 03 status

- `commission_rate` fallback is removed from team create and team overview. If the column is missing, the database is incorrectly migrated.
- `invoices` and `subscriptions` now read from SQL views instead of route-local fallback joins.
- `.github/workflows/supabase-production.yml` verifies the required tables, columns, views, and RPC dependencies after `supabase db push`.

## Bundle 04 status

- `admin_scope_enums` is now applied in live, and `admin_role` includes explicit billing/team/overview scopes in addition to legacy roles.
- `20260422113748_admin_bundle_catchup.sql` is the compatibility migration for environments that were behind Bundle 02-04 but already had the earlier, drifted migration history.
- `20260422142631_backfill_cm_assignments_from_account_manager.sql` backfills active owner rows from `customer_profiles.account_manager*` so Team and Payroll can trust `cm_assignments`.
- Supabase migration history has been reconciled so `supabase migration list` shows the same version set locally and in live.

## Remaining warning paths

- `billing-service.ts` can still warn if `stripe_sync_log.environment` is missing in older environments.
- `payroll.ts` and `audit-log.ts` can still expose `schemaWarnings` in environments that have not received the migration chain above.
- `stripe/billing-adjustments.ts` can still warn if `stripe_credit_notes` or `stripe_refunds` are missing, but those tables should now exist through the migration chain above.
