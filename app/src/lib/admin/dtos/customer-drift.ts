import type { DerivedCustomerStatus } from '@/lib/admin/customer-status';

export interface CustomerOverviewInitialData {
  business_name: string;
  status:
    | 'active'
    | 'paused'
    | 'archived'
    | 'prospect'
    | 'invited'
    | 'pending';
  derived_status?: DerivedCustomerStatus | string | null;
  invited_at?: string | null;
  paused_until: string | null;
  monthly_price_ore: number;
  account_manager_id: string | null;
  account_manager_member_id: string | null;
  account_manager_name: string | null;
  account_manager_avatar_url: string | null;
  account_manager_email: string | null;
  account_manager_city: string | null;
  account_manager_commission_rate: number | null;
  account_manager_since: string | null;
  scheduled_cm_change?: {
    effective_date: string;
    next_cm_name: string | null;
  } | null;
  next_invoice_estimate_ore: number;
  next_invoice_date: string | null;
  last_activity_at: string | null;
  last_activity_summary: string | null;
  stripe_customer_id: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
}

export type TikTokPulseHistoryPoint = {
  snapshot_date: string;
  followers: number;
  total_videos: number;
  videos_last_24h: number;
  total_views_24h: number;
  engagement_rate: number;
};

export type TikTokPulseVideo = {
  video_id: string;
  uploaded_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  share_url: string | null;
  cover_image_url: string | null;
  description?: string | null;
};

export interface CustomerPulseInitialData {
  last_cm_action_at: string | null;
  last_cm_action_type: string | null;
  last_cm_action_by: string | null;
  planned_concepts_this_week: number;
  expected_concepts_per_week: number;
  delivered_concepts_this_week: number;
  recent_publications: Array<{
    id: string;
    title: string | null;
    description?: string | null;
    published_at: string;
    platform: string;
    url: string | null;
  }>;
  tiktok_stats?: {
    history: TikTokPulseHistoryPoint[];
    current_followers: number;
    follower_delta_7d: number;
    follower_delta_30d: number;
    avg_engagement: number;
    recent_videos?: TikTokPulseVideo[];
  } | null;
  upload_schedule?: string[] | null;
}
