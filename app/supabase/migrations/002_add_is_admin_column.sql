-- Add is_admin column for admin access control
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_admin IS 'Grants admin access to admin API endpoints';
