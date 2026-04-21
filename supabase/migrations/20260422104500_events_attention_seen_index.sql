create index if not exists events_attention_seen_lookup_idx
  on public.events (type, entity_type, entity_id, created_at desc);
