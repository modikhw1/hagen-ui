-- supabase/migrations/20260426120100_sync_sub_id_trigger.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_customer_profile_subscription_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_profile_id IS NOT NULL THEN
    UPDATE public.customer_profiles
       SET stripe_subscription_id = NEW.stripe_subscription_id
     WHERE id = NEW.customer_profile_id
       AND (stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_profile_subscription_id ON public.subscriptions;
CREATE TRIGGER trg_sync_customer_profile_subscription_id
  AFTER INSERT OR UPDATE OF stripe_subscription_id, customer_profile_id
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_profile_subscription_id();

COMMIT;