-- Migration: Force add archived_at to customer_profiles
-- Purpose: Resolve 42703 error in subsequent hardening migrations.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'customer_profiles' 
        AND column_name = 'archived_at'
    ) THEN
        ALTER TABLE public.customer_profiles ADD COLUMN archived_at timestamptz;
    END IF;
END
$$;

COMMIT;
