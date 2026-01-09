export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          email: string
          business_name: string
          business_description: string | null
          goals: string[]
          constraints: string[]
          industry_tags: string[]
          profile_completeness: number
          social_tiktok: string | null
          social_instagram: string | null
          has_paid: boolean
          stripe_customer_id: string | null
        }
        Insert: {
          id: string
          email: string
          business_name: string
          business_description?: string | null
          goals?: string[]
          constraints?: string[]
          industry_tags?: string[]
          profile_completeness?: number
          social_tiktok?: string | null
          social_instagram?: string | null
          has_paid?: boolean
          stripe_customer_id?: string | null
        }
        Update: {
          business_name?: string
          business_description?: string | null
          goals?: string[]
          constraints?: string[]
          industry_tags?: string[]
          profile_completeness?: number
          social_tiktok?: string | null
          social_instagram?: string | null
          has_paid?: boolean
          stripe_customer_id?: string | null
        }
      }
      concepts: {
        Row: {
          id: string
          created_at: string
          headline: string
          origin_country: string
          origin_flag: string
          trend_level: number
          difficulty: string
          people_needed: string
          film_time: string
          price: number
          video_url: string | null
          script_content: Json | null
          is_active: boolean
        }
        Insert: {
          id?: string
          headline: string
          origin_country: string
          origin_flag: string
          trend_level: number
          difficulty: string
          people_needed: string
          film_time: string
          price: number
          video_url?: string | null
          script_content?: Json | null
          is_active?: boolean
        }
        Update: {
          headline?: string
          origin_country?: string
          origin_flag?: string
          trend_level?: number
          difficulty?: string
          people_needed?: string
          film_time?: string
          price?: number
          video_url?: string | null
          script_content?: Json | null
          is_active?: boolean
        }
      }
      user_concepts: {
        Row: {
          id: string
          created_at: string
          user_id: string
          concept_id: string
          match_percentage: number
          why_it_fits: string[]
          is_purchased: boolean
          purchased_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          concept_id: string
          match_percentage: number
          why_it_fits?: string[]
          is_purchased?: boolean
          purchased_at?: string | null
        }
        Update: {
          match_percentage?: number
          why_it_fits?: string[]
          is_purchased?: boolean
          purchased_at?: string | null
        }
      }
    }
  }
}

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Concept = Database['public']['Tables']['concepts']['Row']
export type UserConcept = Database['public']['Tables']['user_concepts']['Row']
