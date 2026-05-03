-- Logg över alla inkommande Stripe-events och vad de orsakade i appen
CREATE TABLE public.stripe_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE,
  event_type text NOT NULL,
  object_type text,
  object_id text,
  customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook', 'manual_resync', 'reconcile_job', 'app_action')),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'applied', 'skipped', 'failed')),
  applied_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  environment text
);

CREATE INDEX idx_stripe_sync_events_customer ON public.stripe_sync_events (customer_profile_id, received_at DESC) WHERE customer_profile_id IS NOT NULL;
CREATE INDEX idx_stripe_sync_events_object ON public.stripe_sync_events (object_type, object_id, received_at DESC);
CREATE INDEX idx_stripe_sync_events_event_type ON public.stripe_sync_events (event_type, received_at DESC);
CREATE INDEX idx_stripe_sync_events_received ON public.stripe_sync_events (received_at DESC);
CREATE INDEX idx_stripe_sync_events_status ON public.stripe_sync_events (status, received_at DESC) WHERE status IN ('failed', 'skipped');

ALTER TABLE public.stripe_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_sync_events_admin_read"
  ON public.stripe_sync_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Inga insert/update/delete-policies: skrivs endast från server-side med service-role-nyckel
COMMENT ON TABLE public.stripe_sync_events IS 'Audit-logg över inkommande Stripe-events och deras effekt i appen. Skrivs endast från server-side (webhook, reconcile-jobb).';