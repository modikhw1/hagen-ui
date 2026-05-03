-- Make cm_activities logging resilient so future trigger or constraint drift
-- can never crash a primary write to customer_concepts or customer_profiles.
--
-- Background: log_concept_activity / log_upload_activity insert into
-- cm_activities, which carries a CHECK (activity_type IN (...)) constraint.
-- The constraint and the triggers each maintained their own hard-coded list
-- of allowed values and drifted apart once already (task #34: 'concept_created'
-- was emitted by the trigger but rejected by the check, aborting the
-- collaboration save). Activity logging is a side-effect — it must never be
-- able to abort a user-facing write.
--
-- Defense in depth:
--   1. Drop the rigid CHECK constraint so adding a new activity_type in a
--      trigger no longer requires a coordinated constraint migration.
--      activity_type stays NOT NULL TEXT — the application is the source of
--      truth for the vocabulary.
--   2. Recreate log_concept_activity and log_upload_activity so the INSERT
--      into cm_activities runs inside a BEGIN/EXCEPTION block. Any failure
--      (check_violation, foreign_key_violation, not_null_violation, or any
--      other unexpected error) is logged via RAISE WARNING and swallowed
--      so the originating row operation always succeeds.

-- 1. Drop the rigid CHECK constraint.
ALTER TABLE public.cm_activities
  DROP CONSTRAINT IF EXISTS cm_activities_activity_type_check;

-- 2a. log_concept_activity: never abort the parent INSERT/UPDATE on
--     customer_concepts even if the cm_activities INSERT fails.
CREATE OR REPLACE FUNCTION public.log_concept_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cm_id uuid;
  v_cm_email text;
  v_cm_name text;
  v_type text;
BEGIN
  IF NEW.cm_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    tm.id,
    COALESCE(p.email, tm.email),
    tm.name
  INTO v_cm_id, v_cm_email, v_cm_name
  FROM public.team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.profile_id
  WHERE tm.profile_id = NEW.cm_id
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_type := 'concept_created';
  ELSIF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    v_type := 'concept_sent';
  ELSE
    v_type := 'concept_updated';
  END IF;

  BEGIN
    INSERT INTO public.cm_activities (
      cm_user_id,
      cm_id,
      cm_email,
      cm_name,
      activity_type,
      type,
      customer_profile_id,
      description,
      metadata
    )
    VALUES (
      NEW.cm_id,
      v_cm_id,
      COALESCE(v_cm_email, 'unknown'),
      v_cm_name,
      v_type,
      v_type,
      NEW.customer_profile_id,
      COALESCE(
        NULLIF(NEW.custom_headline, ''),
        NEW.content_overrides->>'headline',
        'Koncept'
      ),
      jsonb_build_object('concept_id', NEW.id, 'status', NEW.status)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Activity logging must never block a concept save. Surface the failure
    -- in the logs so it can be diagnosed, but allow the parent operation to
    -- succeed.
    RAISE WARNING
      'log_concept_activity: cm_activities insert failed for concept % (type=%): % (%).',
      NEW.id, v_type, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- 2b. log_upload_activity: same treatment for uploads on customer_profiles.
CREATE OR REPLACE FUNCTION public.log_upload_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cm_id uuid;
  v_cm_email text;
  v_cm_name text;
BEGIN
  SELECT tm.id, tm.email, tm.name
    INTO v_cm_id, v_cm_email, v_cm_name
  FROM public.team_members tm
  WHERE tm.id = NEW.account_manager_profile_id
     OR tm.email = NEW.account_manager
     OR tm.name = NEW.account_manager
  LIMIT 1;

  BEGIN
    INSERT INTO public.cm_activities (
      cm_user_id,
      cm_id,
      cm_email,
      cm_name,
      activity_type,
      type,
      customer_profile_id,
      description
    )
    VALUES (
      (SELECT profile_id FROM public.team_members WHERE id = v_cm_id),
      v_cm_id,
      v_cm_email,
      v_cm_name,
      'customer_updated',
      'upload',
      NEW.id,
      'Kund laddade upp video'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Upload activity logging must never block a customer_profiles update.
    RAISE WARNING
      'log_upload_activity: cm_activities insert failed for customer % : % (%).',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.cm_activities.activity_type IS
  'Free-form activity vocabulary owned by the application. The CHECK constraint was removed in 20260503220000 because trigger/constraint drift kept aborting user-facing writes; the logging triggers now swallow insert errors so logging is never load-bearing.';
