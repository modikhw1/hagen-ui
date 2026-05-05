ALTER TABLE public.admin_customer_action_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_idempotency_keys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_customer_action_locks IS
  'Server-side admin action lock table. Access is through service-role API paths; RLS blocks direct public access.';
COMMENT ON TABLE public.admin_idempotency_keys IS
  'Server-side admin idempotency table. Access is through service-role API paths; RLS blocks direct public access.';
