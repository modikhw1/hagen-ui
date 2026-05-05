ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS game_plan text,
  ADD COLUMN IF NOT EXISTS preview_notes text,
  ADD COLUMN IF NOT EXISTS preview_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.demos.game_plan IS
  'Manual CM game-plan excerpt shown on the public demo preview. AI generation can populate this later.';
COMMENT ON COLUMN public.demos.preview_notes IS
  'Internal notes for the demo preview and CRM follow-up.';
COMMENT ON COLUMN public.demos.preview_settings IS
  'Structured presentation settings for the public demo preview.';
COMMENT ON COLUMN public.demos.preview_metrics IS
  'Optional TikTok/account metrics snapshot shown on the public demo preview.';
