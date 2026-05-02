-- Add index to team_members table for performance optimization.

CREATE INDEX IF NOT EXISTS idx_team_members_is_active_name ON public.team_members(is_active, name);
