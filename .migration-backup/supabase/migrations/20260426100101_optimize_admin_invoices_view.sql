BEGIN;

DROP VIEW IF EXISTS public.v_admin_invoices CASCADE;

CREATE OR REPLACE VIEW public.v_admin_invoices AS
SELECT
  i.*,
  -- Optimized customer name lookup by removing the secondary join.
  -- Relies on the primary join via customer_profile_id and falls back to the Stripe customer ID.
  COALESCE(cp.business_name, left(i.stripe_customer_id, 18), 'Okänd') AS customer_name,
  greatest(COALESCE(cn.total_credits, 0), COALESCE(r.total_refunds, 0)) AS refunded_ore,
  CASE
    WHEN greatest(COALESCE(cn.total_credits, 0), COALESCE(r.total_refunds, 0)) <= 0 THEN NULL
    WHEN greatest(COALESCE(cn.total_credits, 0), COALESCE(r.total_refunds, 0)) <
         greatest(COALESCE(i.amount_paid, 0), COALESCE(i.amount_due, 0)) THEN 'partially_refunded'
    ELSE 'refunded'
  END AS refund_state,
  CASE
    WHEN greatest(COALESCE(cn.total_credits, 0), COALESCE(r.total_refunds, 0)) > 0
     AND greatest(COALESCE(cn.total_credits, 0), COALESCE(r.total_refunds, 0)) <
         greatest(COALESCE(i.amount_paid, 0), COALESCE(i.amount_due, 0)) THEN 'partially_refunded'
    ELSE i.status
  END AS display_status
FROM public.invoices i
LEFT JOIN public.customer_profiles cp ON cp.id = i.customer_profile_id
LEFT JOIN (
  SELECT stripe_invoice_id, sum(greatest(0, total)) AS total_credits
  FROM public.stripe_credit_notes
  GROUP BY stripe_invoice_id
) cn ON cn.stripe_invoice_id = i.stripe_invoice_id
LEFT JOIN (
  SELECT stripe_invoice_id, sum(greatest(0, amount)) AS total_refunds
  FROM public.stripe_refunds
  GROUP BY stripe_invoice_id
) r ON r.stripe_invoice_id = i.stripe_invoice_id;

COMMENT ON VIEW public.v_admin_invoices IS 'Optimized view for listing admin invoices. Uses a single join for customer lookup.';

END;
