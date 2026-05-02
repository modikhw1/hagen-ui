-- Migration: Billing Summary Views
-- Purpose: Move summary calculations from JavaScript to SQL to improve performance.

BEGIN;

CREATE OR REPLACE VIEW public.v_admin_invoices_summary
WITH (security_invoker = true) AS
SELECT
  environment,
  status,
  display_status,
  customer_profile_id,
  count(*) as invoice_count,
  sum(amount_due) as total_amount_due,
  sum(amount_paid) as total_amount_paid
FROM public.v_admin_invoices
GROUP BY environment, status, display_status, customer_profile_id;

CREATE OR REPLACE VIEW public.v_admin_subscriptions_summary
WITH (security_invoker = true) AS
SELECT
  environment,
  status,
  cancel_at_period_end,
  interval,
  interval_count,
  customer_profile_id,
  count(*) as subscription_count,
  sum(amount) as total_amount
FROM public.v_admin_subscriptions
GROUP BY environment, status, cancel_at_period_end, interval, interval_count, customer_profile_id;

COMMIT;
