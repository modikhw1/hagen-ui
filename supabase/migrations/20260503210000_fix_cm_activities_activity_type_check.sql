-- Fix cm_activities activity_type check constraint so the log_concept_activity
-- and log_upload_activity triggers can insert their full set of values without
-- violating the constraint. Saving collaboration cards from the studio
-- "Planera samarbete" modal currently fails because the trigger writes
-- 'concept_created' which the original constraint did not allow.

ALTER TABLE public.cm_activities
  DROP CONSTRAINT IF EXISTS cm_activities_activity_type_check;

ALTER TABLE public.cm_activities
  ADD CONSTRAINT cm_activities_activity_type_check
  CHECK (activity_type IN (
    'concept_added',
    'concept_removed',
    'concept_customized',
    'concept_created',
    'concept_updated',
    'concept_sent',
    'email_sent',
    'gameplan_updated',
    'customer_created',
    'customer_updated',
    'customer_invited',
    'upload'
  ));
