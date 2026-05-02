-- Add index to the demos table for performance optimization.

CREATE INDEX IF NOT EXISTS idx_demos_status_responded_at ON public.demos(status, responded_at DESC);
