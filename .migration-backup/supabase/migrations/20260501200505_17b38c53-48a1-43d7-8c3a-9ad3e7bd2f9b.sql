-- Lifecycle state consolidation for customer_profiles
-- Adds canonical lifecycle_state column + backfill from existing signals.

-- 1) Add lifecycle_state column (text + check) — keeps legacy `status` and `onboarding_state` intact.
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'draft';

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_state_changed_at timestamptz NOT NULL DEFAULT now();

-- 2) Constraint on allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_profiles_lifecycle_state_check'
  ) THEN
    ALTER TABLE public.customer_profiles
      ADD CONSTRAINT customer_profiles_lifecycle_state_check
      CHECK (lifecycle_state IN ('draft','invited','active','paused','archived'));
  END IF;
END $$;

-- 3) Index for filtering
CREATE INDEX IF NOT EXISTS idx_customer_profiles_lifecycle_state
  ON public.customer_profiles(lifecycle_state);

-- 4) Backfill from existing signals.
-- Priority: archived > paused > active(=has stripe sub or status=active) > invited(=has invited_at) > draft
UPDATE public.customer_profiles
SET lifecycle_state = CASE
  WHEN archived_at IS NOT NULL OR lower(coalesce(status,'')) = 'archived' THEN 'archived'
  WHEN paused_until IS NOT NULL AND paused_until > CURRENT_DATE THEN 'paused'
  WHEN stripe_subscription_id IS NOT NULL OR lower(coalesce(status,'')) IN ('active','agreed') THEN 'active'
  WHEN invited_at IS NOT NULL OR lower(coalesce(status,'')) IN ('invited','pending') THEN 'invited'
  ELSE 'draft'
END,
lifecycle_state_changed_at = now();

-- 5) Trigger to keep lifecycle_state_changed_at fresh on transitions
CREATE OR REPLACE FUNCTION public.touch_lifecycle_state_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
    NEW.lifecycle_state_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_profiles_lifecycle_touch ON public.customer_profiles;
CREATE TRIGGER trg_customer_profiles_lifecycle_touch
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_lifecycle_state_changed_at();