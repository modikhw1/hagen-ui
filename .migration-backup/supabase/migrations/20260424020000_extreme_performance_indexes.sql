-- Migration: Extreme Performance Indexes
-- Purpose: Optimize specifically identified bottlenecks in Admin Overview, Billing and Customer List.

BEGIN;

-- 1. Optimize v_admin_invoices joins
-- Previous indexes on customer_profile_id and stripe_customer_id exist.
-- These two are critical for the GROUP BY subqueries inside the view.
CREATE INDEX IF NOT EXISTS idx_stripe_credit_notes_invoice_id 
ON public.stripe_credit_notes(stripe_invoice_id);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_invoice_id 
ON public.stripe_refunds(stripe_invoice_id);

-- 2. Optimize Overview Attention queries
-- These support the unread count and overview attention section.
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date 
ON public.invoices(status, due_date) 
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cm_notifications_unresolved 
ON public.cm_notifications(resolved_at) 
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demos_status_responded_at 
ON public.demos(status, responded_at DESC);

-- 3. Optimize v_customer_buffer subqueries
-- support for planned publish date max lookup
CREATE INDEX IF NOT EXISTS idx_feedplan_concepts_customer_publish 
ON public.feedplan_concepts(customer_id, status, planned_publish_date DESC)
WHERE status IN ('draft', 'ready');

COMMIT;
