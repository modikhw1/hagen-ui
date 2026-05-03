/**
 * Brand Types
 * 
 * Type definitions for the brand profiling system
 */

export interface BrandCharacteristics {
  team_size?: 'solo' | 'small' | 'medium' | 'large'
  business_age?: 'pre-launch' | 'startup' | 'established' | 'legacy'
  owner_background?: 'professional-pivot' | 'industry-native' | 'entrepreneur'
  social_media_experience?: 'none' | 'beginner' | 'intermediate' | 'advanced'
  content_creation_capacity?: 'limited' | 'moderate' | 'dedicated'
  brand_personality_inferred?: string[]
}

export interface BrandTone {
  primary?: 'casual' | 'professional' | 'playful' | 'inspirational' | 'edgy' | 'warm'
  secondary?: string[]
  avoid?: string[]
  energy_level?: number // 1-10
  humor_tolerance?: number // 1-10
  formality?: number // 1-10
  vulnerability?: number // 1-10
}

export interface BrandCurrentState {
  visual_identity_established?: boolean
  voice_consistency?: 'none' | 'emerging' | 'established'
  audience_clarity?: 'unclear' | 'somewhat-clear' | 'well-defined'
  content_history?: 'none' | 'sporadic' | 'regular'
  platform_presence?: string[]
}

export interface BrandGoals {
  business_goals?: string[]
  social_media_goals?: string[]
  content_aspirations?: string[]
  timeline?: 'immediate' | 'quarter' | 'year'
}

export interface BrandTargetAudience {
  description?: string
  demographics?: {
    age_range?: string
    gender?: string
    location?: string
    [key: string]: string | undefined
  }
  psychographics?: string[]
  behaviors?: string[]
}

export interface BrandReferenceVideo {
  url: string
  platform?: 'tiktok' | 'youtube' | 'instagram'
  why_admired?: string
  analyzed_video_id?: string | null
  aspects_admired?: string[]
  extracted_tone?: {
    energy?: number
    humor_level?: number
    production_style?: 'raw' | 'polished' | 'mixed'
    content_type?: 'educational' | 'entertainment' | 'promotional'
    tone_tags?: string[]
  }
}

export interface BrandProfile {
  id: string
  name: string
  business_type?: string
  characteristics: BrandCharacteristics
  tone: BrandTone
  current_state: BrandCurrentState
  goals: BrandGoals
  target_audience: BrandTargetAudience
  reference_videos: BrandReferenceVideo[]
  conversation_synthesis?: string
  key_insights?: string[]
  embedding?: number[]
  user_id?: string
  created_at: string
  updated_at: string
  status: 'draft' | 'complete' | 'archived'
}

export type ConversationPhase = 
  | 'introduction'
  | 'business_goals'
  | 'social_goals'
  | 'tone_discovery'
  | 'audience'
  | 'references'
  | 'synthesis'

export interface BrandConversation {
  id: string
  brand_profile_id: string
  status: 'active' | 'completed' | 'abandoned'
  current_phase: ConversationPhase
  accumulated_insights: AccumulatedInsights
  message_count: number
  total_tokens_used: number
  created_at: string
  updated_at: string
  completed_at?: string
}

export interface ExtractedSignals {
  business_type?: string | null
  team_size?: 'solo' | 'small' | 'medium' | 'large' | null
  business_age?: 'pre-launch' | 'startup' | 'established' | 'legacy' | null
  owner_experience?: 'first-time' | 'experienced' | 'serial' | null
  industry_background?: string | null
  social_media_experience?: 'none' | 'beginner' | 'intermediate' | 'advanced' | null
}

export interface ToneSignals {
  energy_level?: number | null
  formality?: number | null
  humor_comfort?: number | null
  vulnerability_comfort?: number | null
  keywords?: string[]
  avoidances?: string[]
}

export interface GoalSignals {
  primary_motivation?: string | null
  timeline_pressure?: 'urgent' | 'moderate' | 'relaxed' | null
  resource_level?: 'limited' | 'moderate' | 'dedicated' | null
  ambition_level?: 'conservative' | 'moderate' | 'ambitious' | null
}

export interface PersonalitySignals {
  decision_style?: 'intuitive' | 'analytical' | 'collaborative' | null
  risk_tolerance?: 'low' | 'medium' | 'high' | null
  openness_to_trends?: 'traditional' | 'selective' | 'trend-forward' | null
}

export interface MessageInsights {
  signals?: ExtractedSignals
  tone_signals?: ToneSignals
  goal_signals?: GoalSignals
  personality_signals?: PersonalitySignals
  clarification_needed?: string[]
  notable_quotes?: string[]
  confidence?: number
}

export interface AccumulatedInsights {
  signals?: ExtractedSignals
  tone_signals?: ToneSignals
  goal_signals?: GoalSignals
  personality_signals?: PersonalitySignals
  notable_quotes?: string[]
  reference_videos?: BrandReferenceVideo[]
}

export interface BrandConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  message_index: number
  extracted_insights: MessageInsights
  phase?: ConversationPhase
  tokens_used: number
  created_at: string
}

export interface BrandSynthesis {
  narrative_summary: string
  characteristics: BrandCharacteristics
  tone: BrandTone
  current_state: BrandCurrentState
  goals: BrandGoals
  target_audience: BrandTargetAudience
  key_insights: string[]
  content_recommendations: {
    formats_likely_to_fit: string[]
    formats_to_avoid: string[]
    topics_to_explore: string[]
    production_level: 'raw' | 'polished' | 'mixed'
  }
  embedding_text: string
}

export interface VideoMatch {
  id: string
  video_url: string
  platform: string
  title?: string
  similarity: number
  quality_tier?: string
  brand_tone_notes?: string
}
