create table if not exists admin_customer_action_locks (
  lock_key text primary key,
  customer_profile_id uuid not null references customer_profiles(id) on delete cascade,
  request_id text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists admin_customer_action_locks_customer_idx
  on admin_customer_action_locks (customer_profile_id, expires_at desc);
