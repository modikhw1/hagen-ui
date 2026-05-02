-- Add indexes to customer_concepts table for performance optimization.

CREATE INDEX IF NOT EXISTS idx_customer_concepts_customer_profile_id ON public.customer_concepts(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_concepts_concept_id ON public.customer_concepts(concept_id);
CREATE INDEX IF NOT EXISTS idx_customer_concepts_profile_status_feed_order ON public.customer_concepts(customer_profile_id, status, feed_order);
