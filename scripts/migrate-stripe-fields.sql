-- Migration: Add Stripe fields to customer_profiles
-- Run this in Supabase SQL Editor

-- Add Stripe customer and subscription IDs
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add invoice and scope fields
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS invoice_text TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS scope_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS subscription_interval TEXT DEFAULT 'month';

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customer_profiles' 
AND column_name IN ('stripe_customer_id', 'stripe_subscription_id', 'invoice_text', 'scope_items', 'subscription_interval');
