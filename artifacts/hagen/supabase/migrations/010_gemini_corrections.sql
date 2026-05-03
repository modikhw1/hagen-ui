-- ============================================================================
-- GEMINI CORRECTIONS SUPPORT
-- Store human corrections to Gemini interpretations for training feedback
-- ============================================================================

-- Add gemini_corrections column to analyzed_videos
ALTER TABLE analyzed_videos 
ADD COLUMN IF NOT EXISTS gemini_corrections JSONB DEFAULT '[]'::jsonb;

-- Index for finding videos with corrections (for training export)
CREATE INDEX IF NOT EXISTS idx_analyzed_videos_has_corrections 
ON analyzed_videos ((gemini_corrections IS NOT NULL AND gemini_corrections != '[]'::jsonb));

-- Add comment explaining the structure
COMMENT ON COLUMN analyzed_videos.gemini_corrections IS 
'Array of human corrections to Gemini interpretations. Structure:
[{
  timestamp: ISO date,
  corrections: { tone?: string, style?: string, humorType?: string, whyFunny?: string, conceptCore?: string },
  note: string (explanation of what was wrong),
  conversationId?: string,
  messageId?: string,
  originalValues: { ... original Gemini values for comparison }
}]
Used for training feedback and fine-tuning Gemini models.';

-- Function to export videos with corrections for training
CREATE OR REPLACE FUNCTION export_gemini_training_corrections()
RETURNS TABLE (
  video_id UUID,
  video_url TEXT,
  original_analysis JSONB,
  corrections JSONB,
  correction_count INT
)
LANGUAGE SQL
AS $$
  SELECT 
    av.id as video_id,
    av.video_url,
    av.visual_analysis as original_analysis,
    av.gemini_corrections as corrections,
    jsonb_array_length(av.gemini_corrections) as correction_count
  FROM analyzed_videos av
  WHERE av.gemini_corrections IS NOT NULL 
    AND av.gemini_corrections != '[]'::jsonb
  ORDER BY jsonb_array_length(av.gemini_corrections) DESC, av.updated_at DESC;
$$;

COMMENT ON FUNCTION export_gemini_training_corrections IS 
'Export videos that have human corrections for Gemini training/fine-tuning purposes';
