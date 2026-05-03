-- Adds the extra columns required for the "samarbete" (collaboration) variant
-- of customer_concepts. The variant is identified by visual_variant = 'collaboration'
-- and reuses partner_name as the collaborator's display name.

ALTER TABLE public.customer_concepts
  ADD COLUMN IF NOT EXISTS collaborator_reach text,
  ADD COLUMN IF NOT EXISTS collaborator_avatar_url text,
  ADD COLUMN IF NOT EXISTS scope text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price integer,
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collaboration_note text,
  ADD COLUMN IF NOT EXISTS collaboration_date_type text;

-- Allow collaboration rows to skip the FK to concepts (concept_id is nullable already
-- and the imported_history rows have used null for a long time).

COMMENT ON COLUMN public.customer_concepts.collaborator_reach IS
  'Free-text follower count for collaboration cards (e.g. "42k").';
COMMENT ON COLUMN public.customer_concepts.collaborator_avatar_url IS
  'URL to the collaborator profile image for collaboration cards.';
COMMENT ON COLUMN public.customer_concepts.scope IS
  'Scope tags for the collaboration (medverka, skriva, producera, skriva_medverka).';
COMMENT ON COLUMN public.customer_concepts.price IS
  'Agreed price in SEK (integer), nullable.';
COMMENT ON COLUMN public.customer_concepts.confirmed IS
  'Whether the collaboration has been confirmed.';
COMMENT ON COLUMN public.customer_concepts.collaboration_note IS
  'Free-text note about the collaboration (e.g. logistics).';
COMMENT ON COLUMN public.customer_concepts.collaboration_date_type IS
  'Whether the collaboration date is an exact date or a projected/estimated one (exact|projected).';
