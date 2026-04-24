-- Add index to cm_assignments table for performance optimization of scheduled changes.

CREATE INDEX IF NOT EXISTS idx_cm_assignments_active_scheduled
  ON public.cm_assignments (valid_to, scheduled_change)
  WHERE valid_to IS NULL AND scheduled_change IS NOT NULL;
