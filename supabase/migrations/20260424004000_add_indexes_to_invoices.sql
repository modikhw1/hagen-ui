-- Add indexes to the invoices table for performance optimization of v_admin_invoices.

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status_created_at ON public.invoices(customer_profile_id, status, created_at DESC);
