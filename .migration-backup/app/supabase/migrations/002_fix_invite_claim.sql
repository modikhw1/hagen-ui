-- Fix invite auto-claim by integrating into handle_new_user
-- Applied to production 2026-01-28

-- Create user_clips table if not exists
CREATE TABLE IF NOT EXISTS public.user_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  clip_id text NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES public.profiles(id),
  notes text,
  UNIQUE(user_id, clip_id)
);

-- Enable RLS
ALTER TABLE public.user_clips ENABLE ROW LEVEL SECURITY;

-- Users can view their own clips
DROP POLICY IF EXISTS "Users can view own clips" ON public.user_clips;
CREATE POLICY "Users can view own clips"
  ON public.user_clips FOR SELECT
  USING (auth.uid() = user_id);

-- Remove old triggers/functions first (with CASCADE)
DROP TRIGGER IF EXISTS auto_claim_invite_trigger ON public.profiles;
DROP TRIGGER IF EXISTS trigger_auto_claim_invite ON public.profiles;
DROP TRIGGER IF EXISTS assign_clips_after_profile_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.auto_claim_invite_on_profile_create() CASCADE;
DROP FUNCTION IF EXISTS public.assign_invite_clips_after_profile() CASCADE;

-- Updated handle_new_user that checks invites FIRST
-- Priority: invite.business_name > user-entered > 'My Business'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invite record;
  v_business_name text;
  v_clip_id text;
BEGIN
  -- Check for pending invite for this email
  SELECT * INTO v_invite
  FROM public.invites
  WHERE lower(email) = lower(NEW.email)
    AND claimed_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  -- Determine business name: invite takes priority, then user input, then default
  IF v_invite IS NOT NULL THEN
    v_business_name := COALESCE(v_invite.business_name,
                                (NEW.raw_user_meta_data->>'business_name'),
                                'My Business');
  ELSE
    v_business_name := COALESCE((NEW.raw_user_meta_data->>'business_name'), 'My Business');
  END IF;

  -- Insert profile with invite data (or defaults)
  INSERT INTO public.profiles (
    id,
    email,
    business_name,
    business_description,
    social_tiktok,
    social_instagram,
    has_concepts,
    has_paid
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_business_name,
    CASE WHEN v_invite IS NOT NULL THEN v_invite.business_description ELSE NULL END,
    CASE WHEN v_invite IS NOT NULL THEN v_invite.social_tiktok ELSE NULL END,
    CASE WHEN v_invite IS NOT NULL THEN v_invite.social_instagram ELSE NULL END,
    CASE WHEN v_invite IS NOT NULL THEN true ELSE false END,
    false
  );

  -- If invite exists, claim it and assign clips
  IF v_invite IS NOT NULL THEN
    -- Claim the invite
    UPDATE public.invites
    SET claimed_at = now(),
        claimed_by = NEW.id
    WHERE id = v_invite.id;

    -- Assign clips from invite
    IF v_invite.clip_ids IS NOT NULL AND array_length(v_invite.clip_ids, 1) > 0 THEN
      FOREACH v_clip_id IN ARRAY v_invite.clip_ids
      LOOP
        INSERT INTO public.user_clips (user_id, clip_id, assigned_by, notes)
        VALUES (NEW.id, v_clip_id, v_invite.created_by, 'Auto-assigned from invite')
        ON CONFLICT (user_id, clip_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
