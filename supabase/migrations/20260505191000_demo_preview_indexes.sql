CREATE INDEX IF NOT EXISTS idx_demos_owner_admin_id
  ON public.demos(owner_admin_id)
  WHERE owner_admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_profiles_from_demo_id
  ON public.customer_profiles(from_demo_id)
  WHERE from_demo_id IS NOT NULL;
