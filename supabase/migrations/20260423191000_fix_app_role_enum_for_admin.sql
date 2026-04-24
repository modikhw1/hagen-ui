-- Migration: Fix app_role enum to include admin scopes
-- Purpose: Prevent SQL errors when has_role is called with new admin scopes.

BEGIN;

-- Add values to public.app_role enum if they don't exist
-- Note: PostgreSQL doesn't support 'IF NOT EXISTS' for enum values in a single statement
-- so we use a DO block to make it idempotent.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin') THEN
        ALTER TYPE public.app_role ADD VALUE 'super_admin';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'operations_admin') THEN
        ALTER TYPE public.app_role ADD VALUE 'operations_admin';
    END IF;

    -- Add scopes as roles too to support the has_role checks used in newer policies
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.invoices.read') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.invoices.read';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.invoices.write') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.invoices.write';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.subscriptions.read') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.subscriptions.read';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.subscriptions.write') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.subscriptions.write';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.health.read') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.health.read';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'billing.health.retry') THEN
        ALTER TYPE public.app_role ADD VALUE 'billing.health.retry';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'team.read') THEN
        ALTER TYPE public.app_role ADD VALUE 'team.read';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'team.write') THEN
        ALTER TYPE public.app_role ADD VALUE 'team.write';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'team.archive') THEN
        ALTER TYPE public.app_role ADD VALUE 'team.archive';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'team.absences.write') THEN
        ALTER TYPE public.app_role ADD VALUE 'team.absences.write';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'app_role' AND e.enumlabel = 'overview.read') THEN
        ALTER TYPE public.app_role ADD VALUE 'overview.read';
    END IF;
END
$$;

-- Also fix missing archived_at column which is required by newer views/functions
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMIT;
