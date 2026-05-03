-- Vertex AI Tuning Jobs tracking
-- Store training job metadata and status

CREATE TABLE tuning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vertex AI job identifiers
  job_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  
  -- Job state tracking
  state TEXT DEFAULT 'JOB_STATE_PENDING',
  -- States: JOB_STATE_PENDING, JOB_STATE_RUNNING, JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, JOB_STATE_CANCELLED
  
  -- Training data references
  training_data_uri TEXT,
  validation_data_uri TEXT,
  training_examples INTEGER,
  
  -- Results
  tuned_model_endpoint TEXT,
  error_message TEXT,
  
  -- Configuration used
  config JSONB DEFAULT '{}',
  -- Example: {"epochs": 5, "learningRateMultiplier": 1.0, "adapterSize": 8}
  
  -- Model selection
  is_active BOOLEAN DEFAULT FALSE,
  -- Only one model should be active at a time for inference
  
  -- Metrics from training
  final_loss DECIMAL,
  final_accuracy DECIMAL,
  training_metrics JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_tuning_jobs_state ON tuning_jobs(state);
CREATE INDEX idx_tuning_jobs_active ON tuning_jobs(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_tuning_jobs_created ON tuning_jobs(created_at DESC);

-- Ensure only one active model
CREATE UNIQUE INDEX idx_tuning_jobs_single_active ON tuning_jobs(is_active) WHERE is_active = TRUE;

-- Add GCS URI column to analyzed_videos if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyzed_videos' AND column_name = 'gcs_uri'
  ) THEN
    ALTER TABLE analyzed_videos ADD COLUMN gcs_uri TEXT;
    CREATE INDEX idx_analyzed_videos_gcs ON analyzed_videos(gcs_uri) WHERE gcs_uri IS NOT NULL;
  END IF;
END $$;

-- Function to deactivate other models when one is activated
CREATE OR REPLACE FUNCTION deactivate_other_models()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE tuning_jobs SET is_active = FALSE WHERE id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_active_model
  BEFORE UPDATE ON tuning_jobs
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION deactivate_other_models();

-- Comments
COMMENT ON TABLE tuning_jobs IS 'Tracks Vertex AI fine-tuning jobs for Gemini models';
COMMENT ON COLUMN tuning_jobs.is_active IS 'The currently active model used for predictions';
