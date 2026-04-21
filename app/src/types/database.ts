export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      auto_edit_sessions: {
        Row: {
          audio_selection: Json | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          render_progress: number | null
          render_url: string | null
          slot_fills: Json
          status: string
          template_id: string
          template_snapshot: Json
          text_overlays: Json
          updated_at: string
        }
        Insert: {
          audio_selection?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          render_progress?: number | null
          render_url?: string | null
          slot_fills?: Json
          status?: string
          template_id: string
          template_snapshot?: Json
          text_overlays?: Json
          updated_at?: string
        }
        Update: {
          audio_selection?: Json | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          render_progress?: number | null
          render_url?: string | null
          slot_fills?: Json
          status?: string
          template_id?: string
          template_snapshot?: Json
          text_overlays?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_edit_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_edit_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_edit_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "auto_edit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_edit_templates: {
        Row: {
          aspect_ratio: string
          audio: Json
          color_mood: Json | null
          concept_id: string | null
          content_format: string
          content_style: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string
          design_system_id: string | null
          difficulty: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          pacing_score: number
          preview_url: string | null
          replicability_score: number
          required_elements: Json
          slots: Json
          tags: Json
          target_audience: string | null
          text_overlays: Json
          total_duration: number
          typography_hint: Json | null
          updated_at: string
          variable_elements: Json
        }
        Insert: {
          aspect_ratio?: string
          audio?: Json
          color_mood?: Json | null
          concept_id?: string | null
          content_format?: string
          content_style?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          design_system_id?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          pacing_score?: number
          preview_url?: string | null
          replicability_score?: number
          required_elements?: Json
          slots?: Json
          tags?: Json
          target_audience?: string | null
          text_overlays?: Json
          total_duration?: number
          typography_hint?: Json | null
          updated_at?: string
          variable_elements?: Json
        }
        Update: {
          aspect_ratio?: string
          audio?: Json
          color_mood?: Json | null
          concept_id?: string | null
          content_format?: string
          content_style?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          design_system_id?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          pacing_score?: number
          preview_url?: string | null
          replicability_score?: number
          required_elements?: Json
          slots?: Json
          tags?: Json
          target_audience?: string | null
          text_overlays?: Json
          total_duration?: number
          typography_hint?: Json | null
          updated_at?: string
          variable_elements?: Json
        }
        Relationships: [
          {
            foreignKeyName: "auto_edit_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_edit_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_edit_templates_design_system_id_fkey"
            columns: ["design_system_id"]
            isOneToOne: false
            referencedRelation: "customer_design_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_activities: {
        Row: {
          activity_type: string
          cm_email: string
          cm_user_id: string | null
          created_at: string | null
          customer_profile_id: string | null
          description: string
          id: string
          metadata: Json | null
        }
        Insert: {
          activity_type: string
          cm_email: string
          cm_user_id?: string | null
          created_at?: string | null
          customer_profile_id?: string | null
          description: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          activity_type?: string
          cm_email?: string
          cm_user_id?: string | null
          created_at?: string | null
          customer_profile_id?: string | null
          description?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_activities_cm_user_id_fkey"
            columns: ["cm_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_activities_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_notifications: {
        Row: {
          created_at: string
          customer_id: string | null
          from_cm_id: string
          id: string
          message: string
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_admin_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          from_cm_id: string
          id?: string
          message: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          from_cm_id?: string
          id?: string
          message?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_notifications_from_cm_id_fkey"
            columns: ["from_cm_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_notifications_resolved_by_admin_id_fkey"
            columns: ["resolved_by_admin_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_library_visits: {
        Row: {
          cm_id: string
          last_visit: string | null
        }
        Insert: {
          cm_id: string
          last_visit?: string | null
        }
        Update: {
          cm_id?: string
          last_visit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_library_visits_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_tags: {
        Row: {
          cm_id: string
          color: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          cm_id: string
          color: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          cm_id?: string
          color?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_tags_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_snoozes: {
        Row: {
          id: string
          note: string | null
          release_reason: string | null
          released_at: string | null
          snoozed_at: string
          snoozed_by_admin_id: string
          snoozed_until: string | null
          subject_id: string
          subject_type: string
        }
        Insert: {
          id?: string
          note?: string | null
          release_reason?: string | null
          released_at?: string | null
          snoozed_at?: string
          snoozed_by_admin_id: string
          snoozed_until?: string | null
          subject_id: string
          subject_type: string
        }
        Update: {
          id?: string
          note?: string | null
          release_reason?: string | null
          released_at?: string | null
          snoozed_at?: string
          snoozed_by_admin_id?: string
          snoozed_until?: string | null
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attention_snoozes_snoozed_by_admin_id_fkey"
            columns: ["snoozed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          cm_id: string
          color: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          cm_id: string
          color: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          cm_id?: string
          color?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_versions: {
        Row: {
          backend_data: Json
          change_summary: string | null
          changed_by: string | null
          concept_id: string
          created_at: string | null
          id: string
          overrides: Json
          version: number
        }
        Insert: {
          backend_data: Json
          change_summary?: string | null
          changed_by?: string | null
          concept_id: string
          created_at?: string | null
          id?: string
          overrides: Json
          version: number
        }
        Update: {
          backend_data?: Json
          change_summary?: string | null
          changed_by?: string | null
          concept_id?: string
          created_at?: string | null
          id?: string
          overrides?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_versions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          backend_data: Json
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          overrides: Json | null
          previous_version: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          backend_data: Json
          created_at?: string | null
          created_by?: string | null
          id: string
          is_active?: boolean | null
          overrides?: Json | null
          previous_version?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          backend_data?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          overrides?: Json | null
          previous_version?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "concepts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_concepts: {
        Row: {
          added_at: string | null
          base_concept_version: number | null
          cm_id: string | null
          cm_note: string | null
          collection_id: string | null
          concept_id: string | null
          content_loaded_at: string | null
          content_loaded_seen_at: string | null
          content_overrides: Json | null
          custom_description: string | null
          custom_headline: string | null
          custom_instructions: string | null
          custom_production_notes: string[] | null
          custom_script: string | null
          custom_target_audience: string | null
          custom_why_it_works: string | null
          customer_id: string
          customer_profile_id: string
          feed_order: number | null
          feed_slot: number | null
          filming_instructions: string | null
          id: string
          match_percentage: number | null
          notes: string | null
          planned_publish_at: string | null
          produced_at: string | null
          published_at: string | null
          reconciled_at: string | null
          reconciled_by_cm_id: string | null
          reconciled_customer_concept_id: string | null
          sent_at: string | null
          status: string | null
          tags: string[] | null
          tiktok_comments: number | null
          tiktok_last_synced_at: string | null
          tiktok_likes: number | null
          tiktok_thumbnail_url: string | null
          tiktok_url: string | null
          tiktok_views: number | null
          tiktok_watch_time_seconds: number | null
          updated_at: string | null
          why_it_fits: string | null
        }
        Insert: {
          added_at?: string | null
          base_concept_version?: number | null
          cm_id?: string | null
          cm_note?: string | null
          collection_id?: string | null
          concept_id?: string | null
          content_loaded_at?: string | null
          content_loaded_seen_at?: string | null
          content_overrides?: Json | null
          custom_description?: string | null
          custom_headline?: string | null
          custom_instructions?: string | null
          custom_production_notes?: string[] | null
          custom_script?: string | null
          custom_target_audience?: string | null
          custom_why_it_works?: string | null
          customer_id: string
          customer_profile_id: string
          feed_order?: number | null
          feed_slot?: number | null
          filming_instructions?: string | null
          id?: string
          match_percentage?: number | null
          notes?: string | null
          planned_publish_at?: string | null
          produced_at?: string | null
          published_at?: string | null
          reconciled_at?: string | null
          reconciled_by_cm_id?: string | null
          reconciled_customer_concept_id?: string | null
          sent_at?: string | null
          status?: string | null
          tags?: string[] | null
          tiktok_comments?: number | null
          tiktok_last_synced_at?: string | null
          tiktok_likes?: number | null
          tiktok_thumbnail_url?: string | null
          tiktok_url?: string | null
          tiktok_views?: number | null
          tiktok_watch_time_seconds?: number | null
          updated_at?: string | null
          why_it_fits?: string | null
        }
        Update: {
          added_at?: string | null
          base_concept_version?: number | null
          cm_id?: string | null
          cm_note?: string | null
          collection_id?: string | null
          concept_id?: string | null
          content_loaded_at?: string | null
          content_loaded_seen_at?: string | null
          content_overrides?: Json | null
          custom_description?: string | null
          custom_headline?: string | null
          custom_instructions?: string | null
          custom_production_notes?: string[] | null
          custom_script?: string | null
          custom_target_audience?: string | null
          custom_why_it_works?: string | null
          customer_id?: string
          customer_profile_id?: string
          feed_order?: number | null
          feed_slot?: number | null
          filming_instructions?: string | null
          id?: string
          match_percentage?: number | null
          notes?: string | null
          planned_publish_at?: string | null
          produced_at?: string | null
          published_at?: string | null
          reconciled_at?: string | null
          reconciled_by_cm_id?: string | null
          reconciled_customer_concept_id?: string | null
          sent_at?: string | null
          status?: string | null
          tags?: string[] | null
          tiktok_comments?: number | null
          tiktok_last_synced_at?: string | null
          tiktok_likes?: number | null
          tiktok_thumbnail_url?: string | null
          tiktok_url?: string | null
          tiktok_views?: number | null
          tiktok_watch_time_seconds?: number | null
          updated_at?: string | null
          why_it_fits?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_concepts_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_concepts_reconciled_by_cm_id_fkey"
            columns: ["reconciled_by_cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_concepts_reconciled_customer_concept_id_fkey"
            columns: ["reconciled_customer_concept_id"]
            isOneToOne: false
            referencedRelation: "customer_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_concepts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_concepts_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customer_concepts_collection"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_design_systems: {
        Row: {
          created_at: string
          customer_id: string | null
          definition: Json
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          definition: Json
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          definition?: Json
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_design_systems_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_game_plans: {
        Row: {
          created_at: string
          customer_id: string
          editor_version: number
          html: string
          id: string
          plain_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          editor_version?: number
          html?: string
          id?: string
          plain_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          editor_version?: number
          html?: string
          id?: string
          plain_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_game_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_game_plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          attachments: Json
          cm_id: string
          content: string
          content_html: string | null
          created_at: string | null
          customer_id: string
          id: string
          note_type: string
          primary_customer_concept_id: string | null
          references: Json
          updated_at: string
        }
        Insert: {
          attachments?: Json
          cm_id: string
          content: string
          content_html?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          note_type?: string
          primary_customer_concept_id?: string | null
          references?: Json
          updated_at?: string
        }
        Update: {
          attachments?: Json
          cm_id?: string
          content?: string
          content_html?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          note_type?: string
          primary_customer_concept_id?: string | null
          references?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_primary_customer_concept_id_fkey"
            columns: ["primary_customer_concept_id"]
            isOneToOne: false
            referencedRelation: "customer_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          account_manager: string | null
          account_manager_profile_id: string | null
          agreed_at: string | null
          billing_day_of_month: number | null
          brief: Json | null
          business_name: string
          concepts_per_week: number | null
          concepts: Json | null
          contact_email: string | null
          contacts: Json | null
          contract_metadata: Json | null
          contract_start_date: string | null
          created_at: string | null
          customer_contact_name: string | null
          discount_duration_months: number | null
          discount_end_date: string | null
          discount_start_date: string | null
          discount_type: string | null
          discount_value: number | null
          first_invoice_behavior: string | null
          from_demo_id: string | null
          game_plan: Json | null
          id: string
          invited_at: string | null
          invoice_text: string | null
          last_history_sync_at: string | null
          last_upload_at: string | null
          logo_url: string | null
          monthly_price: number | null
          onboarding_state: string | null
          onboarding_state_changed_at: string | null
          operation_lock_until: string | null
          paused_until: string | null
          pending_history_advance_at: string | null
          phone: string | null
          price_end_date: string | null
          price_start_date: string | null
          pricing_status: string | null
          profile_data: Json | null
          scope_items: Json | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_interval: string | null
          tiktok_handle: string | null
          tiktok_profile_pic_url: string | null
          tiktok_profile_synced_at: string | null
          tiktok_profile_url: string | null
          tiktok_user_id: string | null
          upcoming_monthly_price: number | null
          upcoming_price_effective_date: string | null
          updated_at: string | null
          upload_schedule: string[] | null
          user_id: string | null
        }
        Insert: {
          account_manager?: string | null
          account_manager_profile_id?: string | null
          agreed_at?: string | null
          billing_day_of_month?: number | null
          brief?: Json | null
          business_name: string
          concepts_per_week?: number | null
          concepts?: Json | null
          contact_email?: string | null
          contacts?: Json | null
          contract_metadata?: Json | null
          contract_start_date?: string | null
          created_at?: string | null
          customer_contact_name?: string | null
          discount_duration_months?: number | null
          discount_end_date?: string | null
          discount_start_date?: string | null
          discount_type?: string | null
          discount_value?: number | null
          first_invoice_behavior?: string | null
          from_demo_id?: string | null
          game_plan?: Json | null
          id?: string
          invited_at?: string | null
          invoice_text?: string | null
          last_history_sync_at?: string | null
          last_upload_at?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          onboarding_state?: string | null
          onboarding_state_changed_at?: string | null
          operation_lock_until?: string | null
          paused_until?: string | null
          pending_history_advance_at?: string | null
          phone?: string | null
          price_end_date?: string | null
          price_start_date?: string | null
          pricing_status?: string | null
          profile_data?: Json | null
          scope_items?: Json | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_interval?: string | null
          tiktok_handle?: string | null
          tiktok_profile_pic_url?: string | null
          tiktok_profile_synced_at?: string | null
          tiktok_profile_url?: string | null
          tiktok_user_id?: string | null
          upcoming_monthly_price?: number | null
          upcoming_price_effective_date?: string | null
          updated_at?: string | null
          upload_schedule?: string[] | null
          user_id?: string | null
        }
        Update: {
          account_manager?: string | null
          account_manager_profile_id?: string | null
          agreed_at?: string | null
          billing_day_of_month?: number | null
          brief?: Json | null
          business_name?: string
          concepts_per_week?: number | null
          concepts?: Json | null
          contact_email?: string | null
          contacts?: Json | null
          contract_metadata?: Json | null
          contract_start_date?: string | null
          created_at?: string | null
          customer_contact_name?: string | null
          discount_duration_months?: number | null
          discount_end_date?: string | null
          discount_start_date?: string | null
          discount_type?: string | null
          discount_value?: number | null
          first_invoice_behavior?: string | null
          from_demo_id?: string | null
          game_plan?: Json | null
          id?: string
          invited_at?: string | null
          invoice_text?: string | null
          last_history_sync_at?: string | null
          last_upload_at?: string | null
          logo_url?: string | null
          monthly_price?: number | null
          onboarding_state?: string | null
          onboarding_state_changed_at?: string | null
          operation_lock_until?: string | null
          paused_until?: string | null
          pending_history_advance_at?: string | null
          phone?: string | null
          price_end_date?: string | null
          price_start_date?: string | null
          pricing_status?: string | null
          profile_data?: Json | null
          scope_items?: Json | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_interval?: string | null
          tiktok_handle?: string | null
          tiktok_profile_pic_url?: string | null
          tiktok_profile_synced_at?: string | null
          tiktok_profile_url?: string | null
          tiktok_user_id?: string | null
          upcoming_monthly_price?: number | null
          upcoming_price_effective_date?: string | null
          updated_at?: string | null
          upload_schedule?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_account_manager_profile_id_fkey"
            columns: ["account_manager_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_from_demo_id_fkey"
            columns: ["from_demo_id"]
            isOneToOne: false
            referencedRelation: "demos"
            referencedColumns: ["id"]
          },
        ]
      }
      demos: {
        Row: {
          company_name: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          lost_reason: string | null
          opened_at: string | null
          owner_admin_id: string | null
          preliminary_feedplan: Json | null
          proposed_concepts_per_week: number | null
          proposed_price_ore: number | null
          resolved_at: string | null
          responded_at: string | null
          sent_at: string | null
          status: string
          status_changed_at: string
          tiktok_handle: string | null
          tiktok_profile_pic_url: string | null
        }
        Insert: {
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          lost_reason?: string | null
          opened_at?: string | null
          owner_admin_id?: string | null
          preliminary_feedplan?: Json | null
          proposed_concepts_per_week?: number | null
          proposed_price_ore?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          status_changed_at?: string
          tiktok_handle?: string | null
          tiktok_profile_pic_url?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          lost_reason?: string | null
          opened_at?: string | null
          owner_admin_id?: string | null
          preliminary_feedplan?: Json | null
          proposed_concepts_per_week?: number | null
          proposed_price_ore?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          status_changed_at?: string
          tiktok_handle?: string | null
          tiktok_profile_pic_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demos_owner_admin_id_fkey"
            columns: ["owner_admin_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_motor_signals: {
        Row: {
          acknowledged_at: string | null
          auto_resolved_at: string | null
          created_at: string | null
          customer_id: string
          id: string
          payload: Json | null
          signal_type: string
        }
        Insert: {
          acknowledged_at?: string | null
          auto_resolved_at?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          payload?: Json | null
          signal_type?: string
        }
        Update: {
          acknowledged_at?: string | null
          auto_resolved_at?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          payload?: Json | null
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_motor_signals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_log: {
        Row: {
          id: number
          msg: string | null
          ts: string | null
        }
        Insert: {
          id?: number
          msg?: string | null
          ts?: string | null
        }
        Update: {
          id?: number
          msg?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      email_history: {
        Row: {
          concepts_included: string[] | null
          content: Json | null
          customer_profile_id: string | null
          email_type: string
          error_message: string | null
          id: string
          recipient_email: string
          scheduled_from: string | null
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          concepts_included?: string[] | null
          content?: Json | null
          customer_profile_id?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          recipient_email: string
          scheduled_from?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          concepts_included?: string[] | null
          content?: Json | null
          customer_profile_id?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          scheduled_from?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_history_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_history_scheduled_from_fkey"
            columns: ["scheduled_from"]
            isOneToOne: false
            referencedRelation: "email_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_jobs: {
        Row: {
          attempts: number
          body_html: string
          cm_id: string
          concept_ids: string[]
          created_at: string
          customer_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          provider_message_id: string | null
          recipient_email: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body_html: string
          cm_id: string
          concept_ids?: string[]
          created_at?: string
          customer_id: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          provider_message_id?: string | null
          recipient_email: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body_html?: string
          cm_id?: string
          concept_ids?: string[]
          created_at?: string
          customer_id?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          provider_message_id?: string | null
          recipient_email?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_jobs_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          body_html: string
          cm_id: string
          concept_ids: string[] | null
          customer_id: string
          id: string
          sent_at: string | null
          subject: string
        }
        Insert: {
          body_html: string
          cm_id: string
          concept_ids?: string[] | null
          customer_id: string
          id?: string
          sent_at?: string | null
          subject: string
        }
        Update: {
          body_html?: string
          cm_id?: string
          concept_ids?: string[] | null
          customer_id?: string
          id?: string
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_schedules: {
        Row: {
          created_at: string | null
          customer_profile_id: string | null
          day_of_week: number | null
          email_intro: string | null
          email_outro: string | null
          email_subject: string | null
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          next_send_at: string | null
          rules: Json | null
          schedule_type: string
          send_time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_profile_id?: string | null
          day_of_week?: number | null
          email_intro?: string | null
          email_outro?: string | null
          email_subject?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          rules?: Json | null
          schedule_type?: string
          send_time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_profile_id?: string | null
          day_of_week?: number | null
          email_intro?: string | null
          email_outro?: string | null
          email_subject?: string | null
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          next_send_at?: string | null
          rules?: Json | null
          schedule_type?: string
          send_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_schedules_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_spans: {
        Row: {
          body: string
          climax: number | null
          cm_id: string
          color_index: number
          created_at: string | null
          customer_id: string
          frac_end: number
          frac_start: number
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          body?: string
          climax?: number | null
          cm_id: string
          color_index?: number
          created_at?: string | null
          customer_id: string
          frac_end: number
          frac_start: number
          id?: string
          title?: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          climax?: number | null
          cm_id?: string
          color_index?: number
          created_at?: string | null
          customer_id?: string
          frac_end?: number
          frac_start?: number
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_spans_cm_id_fkey"
            columns: ["cm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_spans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          avatar_url: string | null
          business_description: string | null
          business_name: string | null
          claimed_at: string | null
          claimed_by: string | null
          clip_ids: string[] | null
          created_at: string | null
          created_by: string | null
          email: string
          energy: string | null
          expires_at: string | null
          id: string
          industry: string | null
          notes: string | null
          social_links: Json | null
          subscription_price_cents: number | null
          subscription_scope: string | null
          subscription_type: string | null
          token: string
          tone: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          clip_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          email: string
          energy?: string | null
          expires_at?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          social_links?: Json | null
          subscription_price_cents?: number | null
          subscription_scope?: string | null
          subscription_type?: string | null
          token?: string
          tone?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          clip_ids?: string[] | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          energy?: string | null
          expires_at?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          social_links?: Json | null
          subscription_price_cents?: number | null
          subscription_scope?: string | null
          subscription_type?: string | null
          token?: string
          tone?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          currency: string
          customer_profile_id: string | null
          due_date: string | null
          environment: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          paid_at: string | null
          raw: Json | null
          status: string
          stripe_customer_id: string
          stripe_invoice_id: string
          stripe_subscription_id: string | null
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          customer_profile_id?: string | null
          due_date?: string | null
          environment?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          raw?: Json | null
          status: string
          stripe_customer_id: string
          stripe_invoice_id: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          customer_profile_id?: string | null
          due_date?: string | null
          environment?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          raw?: Json | null
          status?: string
          stripe_customer_id?: string
          stripe_invoice_id?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          created_at: string
          currency: string
          data: Json | null
          description: string
          environment: string | null
          id: string
          period_end: string | null
          period_start: string | null
          quantity: number
          stripe_invoice_id: string
          stripe_invoice_item_id: string | null
          stripe_line_item_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          data?: Json | null
          description?: string
          environment?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          stripe_invoice_id: string
          stripe_invoice_item_id?: string | null
          stripe_line_item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          data?: Json | null
          description?: string
          environment?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          stripe_invoice_id?: string
          stripe_invoice_item_id?: string | null
          stripe_line_item_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string | null
          email: string
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_description: string | null
          business_name: string | null
          created_at: string | null
          current_period_end: string | null
          email: string
          energy: string | null
          grid_config: Json | null
          has_concepts: boolean | null
          has_paid: boolean | null
          id: string
          industry: string | null
          is_admin: boolean | null
          matching_data: Json | null
          role: Database["public"]["Enums"]["user_role"] | null
          social_links: Json | null
          stepper_inbound_token: string | null
          stripe_customer_id: string | null
          subscription_id: string | null
          subscription_price_cents: number | null
          subscription_scope: string | null
          subscription_status: string | null
          subscription_type: string | null
          tone: string[] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email: string
          energy?: string | null
          grid_config?: Json | null
          has_concepts?: boolean | null
          has_paid?: boolean | null
          id: string
          industry?: string | null
          is_admin?: boolean | null
          matching_data?: Json | null
          role?: Database["public"]["Enums"]["user_role"] | null
          social_links?: Json | null
          stepper_inbound_token?: string | null
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_price_cents?: number | null
          subscription_scope?: string | null
          subscription_status?: string | null
          subscription_type?: string | null
          tone?: string[] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_description?: string | null
          business_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email?: string
          energy?: string | null
          grid_config?: Json | null
          has_concepts?: boolean | null
          has_paid?: boolean | null
          id?: string
          industry?: string | null
          is_admin?: boolean | null
          matching_data?: Json | null
          role?: Database["public"]["Enums"]["user_role"] | null
          social_links?: Json | null
          stepper_inbound_token?: string | null
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_price_cents?: number | null
          subscription_scope?: string | null
          subscription_status?: string | null
          subscription_type?: string | null
          tone?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      role_changes_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_role: Database["public"]["Enums"]["user_role"]
          old_role: Database["public"]["Enums"]["user_role"] | null
          profile_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_role: Database["public"]["Enums"]["user_role"]
          old_role?: Database["public"]["Enums"]["user_role"] | null
          profile_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_role?: Database["public"]["Enums"]["user_role"]
          old_role?: Database["public"]["Enums"]["user_role"] | null
          profile_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_changes_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_changes_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_costs: {
        Row: {
          calls: number
          cost_sek: number
          created_at: string
          date: string
          id: string
          metadata: Json | null
          service: string
        }
        Insert: {
          calls?: number
          cost_sek?: number
          created_at?: string
          date: string
          id?: string
          metadata?: Json | null
          service: string
        }
        Update: {
          calls?: number
          cost_sek?: number
          created_at?: string
          date?: string
          id?: string
          metadata?: Json | null
          service?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          customer_id: string
          error: string | null
          fetched_count: number | null
          finished_at: string | null
          id: string
          imported_count: number | null
          mode: string
          reconciled: boolean | null
          started_at: string
          stats_updated_count: number | null
          status: string
        }
        Insert: {
          customer_id: string
          error?: string | null
          fetched_count?: number | null
          finished_at?: string | null
          id?: string
          imported_count?: number | null
          mode: string
          reconciled?: boolean | null
          started_at?: string
          stats_updated_count?: number | null
          status?: string
        }
        Update: {
          customer_id?: string
          error?: string | null
          fetched_count?: number | null
          finished_at?: string | null
          id?: string
          imported_count?: number | null
          mode?: string
          reconciled?: boolean | null
          started_at?: string
          stats_updated_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stepper_email_imports: {
        Row: {
          collection_name: string | null
          created_at: string
          creator_username: string | null
          email_from: string | null
          email_subject: string | null
          error: string | null
          gmail_message_id: string | null
          id: string
          import_group_id: string
          imported_count: number | null
          resolved_collection_url: string | null
          short_url: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          collection_name?: string | null
          created_at?: string
          creator_username?: string | null
          email_from?: string | null
          email_subject?: string | null
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          import_group_id?: string
          imported_count?: number | null
          resolved_collection_url?: string | null
          short_url: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          collection_name?: string | null
          created_at?: string
          creator_username?: string | null
          email_from?: string | null
          email_subject?: string | null
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          import_group_id?: string
          imported_count?: number | null
          resolved_collection_url?: string | null
          short_url?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stepper_gmail_tokens: {
        Row: {
          access_token: string
          created_at: string
          gmail_address: string
          id: string
          last_history_id: string | null
          last_polled_at: string | null
          refresh_token: string
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          gmail_address: string
          id?: string
          last_history_id?: string | null
          last_polled_at?: string | null
          refresh_token: string
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          gmail_address?: string
          id?: string
          last_history_id?: string | null
          last_polled_at?: string | null
          refresh_token?: string
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      stripe_sync_log: {
        Row: {
          created_at: string
          environment: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          object_id: string | null
          object_type: string | null
          payload_summary: Json | null
          status: string
          stripe_event_id: string | null
          sync_direction: string | null
        }
        Insert: {
          created_at?: string
          environment?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          object_id?: string | null
          object_type?: string | null
          payload_summary?: Json | null
          status: string
          stripe_event_id?: string | null
          sync_direction?: string | null
        }
        Update: {
          created_at?: string
          environment?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          object_id?: string | null
          object_type?: string | null
          payload_summary?: Json | null
          status?: string
          stripe_event_id?: string | null
          sync_direction?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          cancel_at: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          customer_profile_id: string | null
          ended_at: string | null
          environment: string | null
          id: string
          interval: string | null
          interval_count: number | null
          pause_collection: Json | null
          raw: Json | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_profile_id: string | null
        }
        Insert: {
          amount?: number
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_profile_id?: string | null
          ended_at?: string | null
          environment?: string | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          pause_collection?: Json | null
          raw?: Json | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Update: {
          amount?: number
          cancel_at?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_profile_id?: string | null
          ended_at?: string | null
          environment?: string | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          pause_collection?: Json | null
          raw?: Json | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_publications: {
        Row: {
          customer_id: string
          fetched_at: string
          id: string
          published_at: string
          tiktok_video_id: string
        }
        Insert: {
          customer_id: string
          fetched_at?: string
          id?: string
          published_at: string
          tiktok_video_id: string
        }
        Update: {
          customer_id?: string
          fetched_at?: string
          id?: string
          published_at?: string
          tiktok_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_publications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_stats: {
        Row: {
          customer_profile_id: string
          engagement_rate: number
          fetched_at: string
          followers: number
          id: string
          raw_payload: Json | null
          snapshot_date: string
          total_videos: number
          total_views_24h: number
          videos_last_24h: number
        }
        Insert: {
          customer_profile_id: string
          engagement_rate?: number
          fetched_at?: string
          followers?: number
          id?: string
          raw_payload?: Json | null
          snapshot_date: string
          total_videos?: number
          total_views_24h?: number
          videos_last_24h?: number
        }
        Update: {
          customer_profile_id?: string
          engagement_rate?: number
          fetched_at?: string
          followers?: number
          id?: string
          raw_payload?: Json | null
          snapshot_date?: string
          total_videos?: number
          total_views_24h?: number
          videos_last_24h?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_stats_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_videos: {
        Row: {
          comments: number
          cover_image_url: string | null
          created_at: string
          customer_profile_id: string
          id: string
          likes: number
          raw_payload: Json | null
          share_url: string | null
          shares: number
          updated_at: string
          uploaded_at: string
          video_id: string
          views: number
        }
        Insert: {
          comments?: number
          cover_image_url?: string | null
          created_at?: string
          customer_profile_id: string
          id?: string
          likes?: number
          raw_payload?: Json | null
          share_url?: string | null
          shares?: number
          updated_at?: string
          uploaded_at: string
          video_id: string
          views?: number
        }
        Update: {
          comments?: number
          cover_image_url?: string | null
          created_at?: string
          customer_profile_id?: string
          id?: string
          likes?: number
          raw_payload?: Json | null
          share_url?: string | null
          shares?: number
          updated_at?: string
          uploaded_at?: string
          video_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_videos_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_customer_history: {
        Row: {
          assigned_at: string
          created_at: string
          customer_profile_id: string | null
          id: string
          notes: string | null
          team_member_id: string | null
          unassigned_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          customer_profile_id?: string | null
          id?: string
          notes?: string | null
          team_member_id?: string | null
          unassigned_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          customer_profile_id?: string | null
          id?: string
          notes?: string | null
          team_member_id?: string | null
          unassigned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_customer_history_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_customer_history_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          avatar_url: string | null
          color: string
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          profile_id: string | null
          responsibility_area: string | null
          role: string
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          color?: string
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          profile_id?: string | null
          responsibility_area?: string | null
          role?: string
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          color?: string
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          profile_id?: string | null
          responsibility_area?: string | null
          role?: string
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_clips: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          clip_id: string
          id: string
          is_unlocked: boolean | null
          notes: string | null
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          clip_id: string
          id?: string
          is_unlocked?: boolean | null
          notes?: string | null
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          clip_id?: string
          id?: string
          is_unlocked?: boolean | null
          notes?: string | null
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_clips_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_clips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          reason?: string
          target_user_id: string
        }
        Returns: boolean
      }
      check_invite_email: { Args: { check_email: string }; Returns: Json }
      claim_invite: { Args: { invite_token: string }; Returns: Json }
      count_draft_concepts: { Args: { p_customer_id: string }; Returns: number }
      current_customer_profile_id: { Args: never; Returns: string }
      get_customer_concept: {
        Args: { p_concept_id: string; p_customer_profile_id: string }
        Returns: Json
      }
      get_last_email_date: { Args: { p_customer_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_content_manager: { Args: never; Returns: boolean }
      is_customer: { Args: never; Returns: boolean }
      log_cm_activity: {
        Args: {
          p_activity_type: string
          p_cm_email: string
          p_cm_user_id: string
          p_customer_profile_id: string
          p_description: string
          p_metadata?: Json
        }
        Returns: string
      }
      shift_feed_order: { Args: { p_customer_id: string }; Returns: undefined }
      update_concept_with_version: {
        Args: {
          p_backend_data: Json
          p_change_summary: string
          p_changed_by: string
          p_concept_id: string
          p_overrides: Json
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "content_manager" | "customer" | "user"
      user_role: "admin" | "content_manager" | "customer" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "content_manager", "customer", "user"],
      user_role: ["admin", "content_manager", "customer", "user"],
    },
  },
} as const
