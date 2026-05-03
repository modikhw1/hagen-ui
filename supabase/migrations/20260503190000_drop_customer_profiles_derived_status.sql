-- Drop the stored `derived_status` column on customer_profiles.
--
-- Background: 20260503120000_align_customer_profiles_with_code.sql added this
-- column and seeded it equal to `status`. The real derived status is computed
-- by `deriveCustomerStatus(...)` in
-- artifacts/letrend/src/lib/admin/customer-status.ts and depends on time-
-- sensitive inputs (paused_until, invited_at, latest_planned_publish_date,
-- escalation_flag, ...) that are not stored on the row. A static stored copy
-- diverges from the real value the moment the clock advances, so any code that
-- reads `customer_profiles.derived_status` directly would be misleading.
--
-- Decision: do NOT replace the column with a generated column / view / trigger.
-- The derivation already lives in TypeScript and depends on `now`, which makes
-- a SQL implementation brittle. Instead, all server endpoints already compute
-- the derived status themselves:
--   * artifacts/letrend/src/lib/admin/customers/list.server.ts   (mapAdminCustomers)
--   * artifacts/letrend/src/lib/admin/customer-detail/load.ts    (buildCustomerPayload / loadAdminCustomerHeader)
--   * artifacts/api-server/src/routes/admin/customers.ts         (returns derived_status: null in the overview payload; clients call deriveCustomerStatus)
--   * artifacts/api-server/src/routes/admin/overview.ts          (uses deriveAttention which reads raw status / paused_until / onboarding_state, never derived_status)
--
-- Dropping the column closes the door on future code accidentally trusting the
-- stored value. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.customer_profiles
  DROP COLUMN IF EXISTS derived_status;

COMMIT;
