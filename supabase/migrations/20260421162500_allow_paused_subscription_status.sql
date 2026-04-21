alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (
    status = any (
      array[
        'incomplete'::text,
        'incomplete_expired'::text,
        'trialing'::text,
        'active'::text,
        'past_due'::text,
        'paused'::text,
        'canceled'::text,
        'unpaid'::text
      ]
    )
  );
