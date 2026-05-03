-- ============================================================================
-- ADD BRAND DIMENSIONS TO EXISTING TABLE
-- ============================================================================
-- Created: December 10, 2025
-- Purpose: Add survival, coolness, and target audience fields to video_brand_ratings
-- Run this if you already have the video_brand_ratings table from 012
-- ============================================================================

-- Add new columns to existing table
ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS survival_score INTEGER CHECK (survival_score >= 1 AND survival_score <= 10) DEFAULT 5;

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS survival_notes TEXT DEFAULT '';

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS coolness_score INTEGER CHECK (coolness_score >= 1 AND coolness_score <= 10) DEFAULT 5;

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS coolness_notes TEXT DEFAULT '';

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS target_age_min INTEGER CHECK (target_age_min >= 12 AND target_age_min <= 65) DEFAULT 18;

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS target_age_max INTEGER CHECK (target_age_max >= 12 AND target_age_max <= 65) DEFAULT 35;

ALTER TABLE video_brand_ratings 
ADD COLUMN IF NOT EXISTS audience_notes TEXT DEFAULT '';

-- ============================================================================
-- COMMENTS for new columns
-- ============================================================================

COMMENT ON COLUMN video_brand_ratings.survival_score IS 
'Survival instinct rating (1-10): 1 = abundance/security mindset, 10 = scarcity-driven/outcome obsessed';

COMMENT ON COLUMN video_brand_ratings.survival_notes IS 
'Observations about survival signals: video quality, structure, consistency, prioritization mindset';

COMMENT ON COLUMN video_brand_ratings.coolness_score IS 
'Social positioning (1-10): 1 = follower/uncool, 10 = leader/cool with frame control';

COMMENT ON COLUMN video_brand_ratings.coolness_notes IS 
'Observations about social signals: frame control, outcome independence, energy generation';

COMMENT ON COLUMN video_brand_ratings.target_age_min IS 
'Minimum target audience age (12-65)';

COMMENT ON COLUMN video_brand_ratings.target_age_max IS 
'Maximum target audience age (12-65)';

COMMENT ON COLUMN video_brand_ratings.audience_notes IS 
'Observations about humor type and target audience: cringe factor, self-deprecation, sophistication level';

-- Update table comment
COMMENT ON TABLE video_brand_ratings IS 
'Stores brand analysis for individual videos - both human interpretation and AI analysis. Uses three-dimensional analysis: Survival (scarcity vs abundance), Coolness (social positioning), and Target Audience (age range).';
