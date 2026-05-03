-- Migration: 015_fix_similar_videos_function
-- Purpose: Fix the find_similar_videos function to use correct column names
-- Date: December 15, 2025

-- The original function referenced av.user_ratings which doesn't exist
-- The analyzed_videos table uses video_ratings as a separate table

-- Drop the existing function first (return type changed)
DROP FUNCTION IF EXISTS find_similar_videos(vector, double precision, integer, uuid);

-- Create the function with correct columns
CREATE FUNCTION find_similar_videos(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10,
  exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  video_url text,
  platform text,
  metadata jsonb,
  user_tags text[],
  similarity float,
  rating jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    av.id,
    av.video_url,
    av.platform,
    av.metadata,
    av.user_tags,
    1 - (av.content_embedding <=> query_embedding) as similarity,
    (
      SELECT jsonb_build_object(
        'overall_score', vr.overall_score,
        'notes', vr.notes,
        'dimensions', vr.dimensions
      )
      FROM video_ratings vr
      WHERE vr.video_id = av.id
      AND vr.rater_id = 'primary'
      LIMIT 1
    ) as rating
  FROM analyzed_videos av
  WHERE av.content_embedding IS NOT NULL
    AND (exclude_id IS NULL OR av.id != exclude_id)
    AND (av.content_embedding <=> query_embedding) < match_threshold
  ORDER BY av.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION find_similar_videos IS 'Find videos similar to a given embedding using cosine similarity. Returns video metadata and optional rating info.';
