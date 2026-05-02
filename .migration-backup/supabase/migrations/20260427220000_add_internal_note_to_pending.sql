BEGIN;

-- Ensure the table exists to support mirroring/metadata for Stripe pending items
CREATE TABLE IF NOT EXISTS public.pending_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_profile_id UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    stripe_invoice_item_id TEXT UNIQUE,
    description TEXT,
    amount_ore INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'sek',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add the internal_note column for internal documentation
ALTER TABLE public.pending_invoice_items 
ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- Enable RLS and add admin policy
ALTER TABLE public.pending_invoice_items ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pending_invoice_items' 
        AND policyname = 'Admins can manage pending invoice items'
    ) THEN
        CREATE POLICY "Admins can manage pending invoice items"
        ON public.pending_invoice_items
        FOR ALL
        TO authenticated
        USING (public.is_admin());
    END IF;
END $$;

COMMIT;
