-- LeTrend MVP Schema
-- Run this in Supabase SQL Editor

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  business_description TEXT,
  goals TEXT[] DEFAULT '{}',
  constraints TEXT[] DEFAULT '{}',
  industry_tags TEXT[] DEFAULT '{}',
  profile_completeness INTEGER DEFAULT 0,
  social_tiktok TEXT,
  social_instagram TEXT,
  has_paid BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT
);

-- Concepts table (you populate manually)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  headline TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  origin_flag TEXT NOT NULL,
  trend_level INTEGER NOT NULL CHECK (trend_level BETWEEN 1 AND 5),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Advanced')),
  people_needed TEXT NOT NULL,
  film_time TEXT NOT NULL,
  price INTEGER NOT NULL,
  video_url TEXT,
  script_content JSONB,
  is_active BOOLEAN DEFAULT TRUE
);

-- User-specific concept data (match %, why it fits, purchased)
CREATE TABLE IF NOT EXISTS user_concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  concept_id UUID REFERENCES concepts(id) NOT NULL,
  match_percentage INTEGER NOT NULL CHECK (match_percentage BETWEEN 0 AND 100),
  why_it_fits TEXT[] DEFAULT '{}',
  is_purchased BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, concept_id)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concepts ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only see/edit their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Concepts: Everyone can read active concepts
CREATE POLICY "Anyone can view active concepts"
  ON concepts FOR SELECT
  USING (is_active = TRUE);

-- User concepts: Users can only see their own
CREATE POLICY "Users can view own user_concepts"
  ON user_concepts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own user_concepts"
  ON user_concepts FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, business_name)
  VALUES (NEW.id, NEW.email, 'My Business');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
