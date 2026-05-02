-- Recreate the view that was cascade-dropped by v_admin_invoices recreation
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

END;
