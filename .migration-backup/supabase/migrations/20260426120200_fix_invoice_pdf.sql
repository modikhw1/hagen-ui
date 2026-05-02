-- supabase/migrations/20260426120200_fix_invoice_pdf.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_customer_invoices_with_lines(
  p_customer_id uuid,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT
      i.id,
      i.stripe_invoice_id,
      i.amount_due,
      i.status,
      i.created_at,
      i.due_date,
      i.hosted_invoice_url,
      i.invoice_pdf
    FROM public.invoices i
    WHERE i.customer_profile_id = p_customer_id
    ORDER BY i.created_at DESC
    LIMIT p_limit
  ),
  lines AS (
    SELECT
      l.stripe_invoice_id,
      jsonb_agg(jsonb_build_object(
        'description', COALESCE(l.description, 'Rad'),
        'amount', COALESCE(l.amount, 0)
      ) ORDER BY l.id) AS items
    FROM public.invoice_line_items l
    WHERE l.stripe_invoice_id IN (SELECT stripe_invoice_id FROM inv WHERE stripe_invoice_id IS NOT NULL)
    GROUP BY l.stripe_invoice_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', inv.id,
    'stripe_invoice_id', inv.stripe_invoice_id,
    'amount_due', COALESCE(inv.amount_due, 0),
    'status', COALESCE(inv.status, ''),
    'created_at', COALESCE(inv.created_at, '1970-01-01'),
    'due_date', inv.due_date,
    'hosted_invoice_url', inv.hosted_invoice_url,
    'invoice_pdf', inv.invoice_pdf,
    'line_items', COALESCE(lines.items, '[]'::jsonb)
  ) ORDER BY inv.created_at DESC), '[]'::jsonb)
  FROM inv
  LEFT JOIN lines ON lines.stripe_invoice_id = inv.stripe_invoice_id;
$$;

COMMIT;