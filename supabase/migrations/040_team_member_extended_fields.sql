-- 040: Extended team member fields
-- Adds invited_at for onboarding status tracking (3.3)
-- Adds bio, region, expertise, start_date, notes for CM profiles (3.2)

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS expertise text[];
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notes text;
