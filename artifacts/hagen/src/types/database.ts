// This file should be generated from your Supabase database schema
// Run: npx supabase gen types typescript --project-id "your-project-ref" > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string
          full_name: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
        }
      }
      analyzed_videos: {
        Row: {
          id: string
          platform: string
          video_url: string
          video_id: string
          metadata: Json | null
          visual_analysis: Json | null
          audio_analysis: Json | null
          user_tags: string[]
          user_notes: string | null
          rating_schema_version: number
          content_embedding: number[] | null
          computed_scores: Json | null
          created_at: string
          analyzed_at: string | null
          rated_at: string | null
          gcs_uri: string | null
        }
        Insert: {
          id?: string
          platform: string
          video_url: string
          video_id: string
          metadata?: Json | null
          visual_analysis?: Json | null
          audio_analysis?: Json | null
          user_tags?: string[]
          user_notes?: string | null
          rating_schema_version?: number
          content_embedding?: number[] | null
          computed_scores?: Json | null
          created_at?: string
          analyzed_at?: string | null
          rated_at?: string | null
          gcs_uri?: string | null
        }
        Update: {
          id?: string
          platform?: string
          video_url?: string
          video_id?: string
          metadata?: Json | null
          visual_analysis?: Json | null
          audio_analysis?: Json | null
          user_tags?: string[]
          user_notes?: string | null
          rating_schema_version?: number
          content_embedding?: number[] | null
          computed_scores?: Json | null
          created_at?: string
          analyzed_at?: string | null
          rated_at?: string | null
          gcs_uri?: string | null
        }
      }
      video_ratings: {
        Row: {
          id: string
          video_id: string
          overall_score: number | null
          dimensions: Json
          tags: string[]
          notes: string | null
          rated_at: string
          training_exported: boolean
          exported_at: string | null
          rater_id: string
        }
        Insert: {
          id?: string
          video_id: string
          overall_score?: number | null
          dimensions?: Json
          tags?: string[]
          notes?: string | null
          rated_at?: string
          training_exported?: boolean
          exported_at?: string | null
          rater_id?: string
        }
        Update: {
          id?: string
          video_id?: string
          overall_score?: number | null
          dimensions?: Json
          tags?: string[]
          notes?: string | null
          rated_at?: string
          training_exported?: boolean
          exported_at?: string | null
          rater_id?: string
        }
      }
      // Add more tables as needed
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
