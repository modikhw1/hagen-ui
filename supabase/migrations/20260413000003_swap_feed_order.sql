-- ─────────────────────────────────────────────────────────────────────────────
-- swap_feed_order (Task 12)
--
-- Atomically swaps the feed_order values of two concepts.
-- Uses FOR UPDATE to prevent race conditions during concurrent swaps.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION swap_feed_order(p_concept_a uuid, p_concept_b uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_a integer;
  v_order_b integer;
BEGIN
  SELECT feed_order INTO v_order_a FROM customer_concepts WHERE id = p_concept_a FOR UPDATE;
  SELECT feed_order INTO v_order_b FROM customer_concepts WHERE id = p_concept_b FOR UPDATE;
  UPDATE customer_concepts SET feed_order = v_order_b WHERE id = p_concept_a;
  UPDATE customer_concepts SET feed_order = v_order_a WHERE id = p_concept_b;
END;
$$;
