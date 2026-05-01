import type { DerivedCustomerStatus } from '@/lib/admin/customer-status';

export type CustomerListFilter = 
  | 'all' 
  | 'active' 
  | 'pending' 
  | 'paused' 
  | 'archived'
  | 'prospect';

export type CustomerListSort = 
  | 'recent'
  | 'name_asc' | 'name_desc'
  | 'cm_asc' | 'cm_desc'
  | 'price_asc' | 'price_desc'
  | 'status_asc' | 'status_desc'
  | 'needs_action'
  | 'alphabetical'; // Legacy

export type CustomerListParams = {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
};

export type AdminCustomerListItem = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  account_manager: string | null;
  account_manager_profile_id: string | null;
  cm_full_name?: string | null;
  cm_avatar_url?: string | null;
  monthly_price: number | null;
  pricing_status: 'fixed' | 'unknown' | null;
  created_at: string;
  status: string;
  onboardingState: 'invited' | 'cm_ready' | 'live' | 'settled';
  onboardingNeedsAttention: boolean;
  onboardingAttentionDays: number;
  bufferStatus: 'ok' | 'thin' | 'under' | 'paused' | 'blocked';
  blocking: { state: 'none' | 'blocked' | 'escalated' };
  blockingDisplayDays: number;
  isNew: boolean;
  derived_status: DerivedCustomerStatus | null;
  last_upload_at?: string | null;
  last_published_at?: string | null;
  last_feed_update?: string | null;
  concepts_per_week?: number | null;
  expected_concepts_per_week?: number | null;
  planned_concepts_count?: number | null;
  latest_planned_publish_date?: string | null;
  upload_schedule?: string[] | null;
  scheduled_cm_change?: {
    effective_date: string;
    next_cm_name: string;
  } | null;
  paused_until?: string | null;
  last_cm_action_at?: string | null;
  operational_signals?: any;
};

export type AdminTeamOption = {
  id: string;
  name: string;
  email: string | null;
  color: string | null;
  avatar_url?: string | null;
};
