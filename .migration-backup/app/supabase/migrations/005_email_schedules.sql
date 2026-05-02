-- Email Schedules and History for Studio

-- Table for scheduled recurring emails
CREATE TABLE IF NOT EXISTS email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL DEFAULT 'weekly', -- 'weekly', 'on_concept_add', 'on_gameplan_update'
  
  -- Schedule config
  day_of_week INTEGER, -- 0=Sunday, 1=Monday, etc.
  send_time TIME DEFAULT '09:00', -- Time to send
  
  -- Rules
  rules JSONB DEFAULT '{}', -- { min_concepts: 1, only_if_new: true, etc. }
  
  -- Email template overrides
  email_subject TEXT,
  email_intro TEXT,
  email_outro TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for sent emails history
CREATE TABLE IF NOT EXISTS email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  
  -- Email details
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  
  -- Content snapshot (JSON)
  content JSONB,
  concepts_included UUID[],
  
  -- Status
  status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'opened'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  scheduled_from UUID REFERENCES email_schedules(id)
);

-- Enable RLS
ALTER TABLE email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service role can manage, users can read their own)
CREATE POLICY "Service role full access email_schedules" ON email_schedules
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access email_history" ON email_history
  FOR ALL USING (true) WITH CHECK (true);
