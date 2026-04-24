import type { DerivedCustomerStatus } from '@/lib/admin/customer-status';

export type CustomerListFilter = 'all' | 'active' | 'pipeline' | 'archived';
export type CustomerListSort = 'newest' | 'oldest' | 'needs_action' | 'alphabetical';

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
  concepts_per_week?: number | null;
  scheduled_cm_change?: {
    effective_date: string;
    next_cm_name: string;
  } | null;
  paused_until?: string | null;
};

export type AdminTeamOption = {
  id: string;
  name: string;
  email: string | null;
  color: string | null;
};
