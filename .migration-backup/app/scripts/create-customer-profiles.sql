-- Create customer_profiles table for pre-generating customer profiles
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_email TEXT,
  monthly_price INTEGER DEFAULT 0, -- in cents
  price_start_date DATE,
  price_end_date DATE,
  contacts JSONB DEFAULT '[]'::jsonb,
  profile_data JSONB DEFAULT '{}'::jsonb,
  game_plan JSONB DEFAULT '{
    "title": "",
    "description": "",
    "goals": [],
    "targetAudience": "",
    "contentThemes": [],
    "postingFrequency": ""
  }'::jsonb,
  concepts JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'archived', 'invited', 'agreed')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  invited_at TIMESTAMPTZ,
  agreed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON public.customer_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users read access (for admin)
CREATE POLICY "Authenticated users can read" ON public.customer_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users insert/update (for admin)
CREATE POLICY "Authenticated users can modify" ON public.customer_profiles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
