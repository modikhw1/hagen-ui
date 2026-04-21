'use client';

import { useQuery } from '@tanstack/react-query';

export type CustomerListRow = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  phone: string | null;
  account_manager: string | null;
  account_manager_profile_id: string | null;
  monthly_price: number | null;
  subscription_interval?: 'month' | 'quarter' | 'year' | string | null;
  pricing_status: 'fixed' | 'unknown' | null;
  status:
    | 'active'
    | 'agreed'
    | 'invited'
    | 'pending'
    | 'pending_payment'
    | 'pending_invoice'
    | 'paused'
    | 'past_due'
    | 'cancelled'
    | 'archived'
    | string;
  created_at: string;
  agreed_at: string | null;
  concepts_per_week: number | null;
  expected_concepts_per_week?: number | null;
  paused_until: string | null;
  onboarding_state: 'invited' | 'cm_ready' | 'live' | 'settled' | null;
  onboarding_state_changed_at?: string | null;
  tiktok_handle: string | null;
  next_invoice_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type CustomerBufferRow = {
  customer_id: string;
  assigned_cm_id: string | null;
  concepts_per_week: number | null;
  paused_until: string | null;
  latest_planned_publish_date: string | null;
  last_published_at: string | null;
};

export type CustomerListPayload = {
  customers: CustomerListRow[];
  bufferRows: CustomerBufferRow[];
};

export type TeamMemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  commission_rate?: number | null;
  color: string | null;
  profile_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  bio?: string | null;
  region?: string | null;
  role?: string | null;
  created_at?: string | null;
  expertise?: string[] | null;
  start_date?: string | null;
  notes?: string | null;
  invited_at?: string | null;
};

export function useCustomers() {
  return useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: async (): Promise<CustomerListPayload> => {
      const response = await fetch('/api/admin/customers', { credentials: 'include' });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        customers?: CustomerListRow[];
        profiles?: CustomerListRow[];
        bufferRows?: CustomerBufferRow[];
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte hamta kunder');
      }

      return {
        customers: payload.customers ?? payload.profiles ?? [],
        bufferRows: payload.bufferRows ?? [],
      };
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['admin', 'team-members'],
    queryFn: async (): Promise<TeamMemberRow[]> => {
      const response = await fetch('/api/admin/team', { credentials: 'include' });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        members?: TeamMemberRow[];
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte hamta teammedlemmar');
      }

      return payload.members ?? [];
    },
  });
}
