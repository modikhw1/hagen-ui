create policy "admin_customer_action_locks_no_client_access"
  on public.admin_customer_action_locks
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "admin_idempotency_keys_no_client_access"
  on public.admin_idempotency_keys
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
