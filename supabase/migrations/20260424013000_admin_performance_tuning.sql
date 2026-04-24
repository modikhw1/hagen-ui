-- Migration: Add missing performance indexes for Admin Dashboard and Billing
-- Purpose: Optimize v_admin_invoices, v_admin_subscriptions, and general admin sorting.

BEGIN;

-- 1. CRITICAL: Index for joining billing entities to profiles via Stripe Customer ID
-- This is used in v_admin_invoices and v_admin_subscriptions
CREATE INDEX IF NOT EXISTS idx_customer_profiles_stripe_customer_id 
ON public.customer_profiles(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- 2. PERFORMANCE: Support fast sorting of global invoices list
-- Used in /admin/billing/invoices
CREATE INDEX IF NOT EXISTS idx_invoices_created_at_desc 
ON public.invoices(created_at DESC);

-- 3. PERFORMANCE: Support fast sorting of global subscriptions list
-- Used in /admin/billing/subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_desc 
ON public.subscriptions(created DESC);

-- 4. PERFORMANCE: Support common filter combinations in billing
-- Already exists in some forms, but ensuring optimal coverage for status filtering
CREATE INDEX IF NOT EXISTS idx_invoices_status_created_at 
ON public.invoices(status, created_at DESC);

-- 5. PERFORMANCE: Optimize v_customer_buffer lookups
-- This helps the scalar subqueries inside the view
CREATE INDEX IF NOT EXISTS idx_tiktok_publications_customer_date 
ON public.tiktok_publications(customer_profile_id, published_at DESC);

-- 6. PERFORMANCE: Support payroll view joins and lookups
-- v_admin_payroll_period depends on joining invoices to line items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_stripe_invoice_id
ON public.invoice_line_items(stripe_invoice_id);

-- 7. PERFORMANCE: Support attention seen lookups
-- Used in the unread count calculation and events.ts
CREATE INDEX IF NOT EXISTS idx_events_admin_attention_seen
ON public.events(type, entity_type, entity_id, created_at DESC)
WHERE type = 'admin.attention_seen' AND entity_type = 'admin_user';

-- 8. PERFORMANCE: Support efficient rate limiting lookups
-- Used in enforceAdminReadRateLimit
CREATE INDEX IF NOT EXISTS idx_admin_request_log_actor_action_created
ON public.admin_request_log(actor_user_id, action, created_at DESC);

COMMIT;
