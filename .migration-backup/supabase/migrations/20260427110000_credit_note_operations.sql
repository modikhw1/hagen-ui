-- supabase/migrations/20260427110000_credit_note_operations.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_note_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  operation_type text NOT NULL
    CHECK (operation_type IN ('credit_note_only', 'credit_note_and_reissue', 'refund')),

  customer_profile_id uuid NOT NULL
    REFERENCES public.customer_profiles(id) ON DELETE RESTRICT,

  source_invoice_id text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'credit_note_created', 'reissue_created', 'completed', 'failed')),

  requires_attention boolean NOT NULL DEFAULT false,
  attention_reason text,

  stripe_credit_note_id text,
  stripe_reissue_invoice_id text,
  stripe_refund_id text,

  amount_ore bigint,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),

  idempotency_key text NOT NULL UNIQUE,
  error_message text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_note_operations_customer
  ON public.credit_note_operations (customer_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_note_operations_attention
  ON public.credit_note_operations (created_at DESC)
  WHERE requires_attention = true;

CREATE INDEX IF NOT EXISTS idx_credit_note_operations_source_invoice
  ON public.credit_note_operations (source_invoice_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_credit_note_operations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_note_operations_updated_at
  ON public.credit_note_operations;

CREATE TRIGGER trg_credit_note_operations_updated_at
  BEFORE UPDATE ON public.credit_note_operations
  FOR EACH ROW EXECUTE FUNCTION public.tg_credit_note_operations_set_updated_at();

-- RLS
ALTER TABLE public.credit_note_operations ENABLE ROW LEVEL SECURITY;

-- Service role bypassar RLS automatiskt (webhook + route använder service_role).
-- Authenticated admins får läsa via has_role-helper (förväntas finnas; om inte
-- finns, ersätt med korrekt admin-check).
DROP POLICY IF EXISTS "Admins can read credit_note_operations"
  ON public.credit_note_operations;

CREATE POLICY "Admins can read credit_note_operations"
ON public.credit_note_operations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.credit_note_operations IS
  'Atomicity anchor för flersteg-operationer mot Stripe (kreditnota + ny faktura). Skapas FÖRE något Stripe-anrop. Status-state-machine säkerställer att vi alltid kan rekonstruera flödet.';

END;
