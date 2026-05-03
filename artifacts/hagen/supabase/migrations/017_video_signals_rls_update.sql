-- Migration: 017_video_signals_rls_update
-- Purpose: Add RLS policy to allow anon users to insert/update video_signals
-- This enables the /api/analyze-rate endpoint to work with anon key if service role isn't available
-- Date: December 18, 2025

-- =============================================================================
-- UPDATE RLS POLICIES FOR video_signals
-- =============================================================================

-- Allow anon users full access (for API routes without auth)
-- In production, you may want to restrict this to only INSERT/UPDATE
CREATE POLICY "Anon users can manage video_signals" ON video_signals
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Allow anon users to read video_insights
CREATE POLICY "Anon users can read video_insights" ON video_insights
    FOR SELECT 
    USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY "Anon users can manage video_signals" ON video_signals IS 
    'Allows unauthenticated API routes to insert/update video signals. Consider restricting in production.';
