-- Add index to cm_interactions table for performance optimization.

CREATE INDEX IF NOT EXISTS idx_cm_interactions_created_at_desc ON public.cm_interactions(created_at DESC);
