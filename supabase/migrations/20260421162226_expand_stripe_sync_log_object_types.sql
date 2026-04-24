alter table public.stripe_sync_log
  drop constraint if exists stripe_sync_log_object_type_check;

alter table public.stripe_sync_log
  add constraint stripe_sync_log_object_type_check
  check (
    object_type = any (
      array[
        'customer'::text,
        'subscription'::text,
        'invoice'::text,
        'invoice_item'::text,
        'credit_note'::text,
        'charge'::text,
        'payment_method'::text,
        'other'::text
      ]
    )
  );
