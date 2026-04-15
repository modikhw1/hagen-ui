-- ─────────────────────────────────────────────────────────────────────────────
-- shift_feed_order
--
-- Atomically shifts all feed_order values for a customer by p_advance_count.
-- Used by performMarkProduced to replace the JS-loop approach.
-- Runs inside an implicit transaction (SQL-function guarantees atomicity).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION shift_feed_order(
  p_customer_id uuid,
  p_advance_count integer DEFAULT 1
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE customer_concepts
  SET feed_order = feed_order - p_advance_count
  WHERE customer_profile_id = p_customer_id
    AND feed_order IS NOT NULL;
$$;
