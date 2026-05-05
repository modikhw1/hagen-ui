ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS game_plan_html text,
  ADD COLUMN IF NOT EXISTS game_plan_generation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS game_plan_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS game_plan_source text;

COMMENT ON COLUMN public.demos.game_plan_html IS
  'Rich HTML Game Plan draft generated for or manually attached to a public demo preview.';
COMMENT ON COLUMN public.demos.game_plan_generation_context IS
  'Structured answers and prompt context used when generating the demo Game Plan draft.';
COMMENT ON COLUMN public.demos.game_plan_generated_at IS
  'Timestamp for the latest generated demo Game Plan draft.';
COMMENT ON COLUMN public.demos.game_plan_source IS
  'Source of the latest demo Game Plan draft, e.g. ai or fallback.';
