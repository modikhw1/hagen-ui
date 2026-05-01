BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_note_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL CHECK (operation_type IN ('credit_note_only','credit_note_and_reissue','refund')),
  customer_profile_id uuid NOT NULL REFERENCES public.customer_profiles(id),
  source_invoice_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credit_note_created','reissue_created','completed','failed')),
  requires_attention boolean NOT NULL DEFAULT false,
  attention_reason text,
  stripe_credit_note_id text,
  stripe_reissue_invoice_id text,
  stripe_refund_id text,
  amount_ore bigint,
  idempotency_key text NOT NULL UNIQUE,
  error_message text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_note_ops_customer_created ON public.credit_note_operations(customer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_note_ops_requires_attention ON public.credit_note_operations(requires_attention) WHERE requires_attention = true;

COMMENT ON TABLE public.credit_note_operations IS 'Atomicity anchor for invoice credit operations to prevent partial reversals.';

END;
