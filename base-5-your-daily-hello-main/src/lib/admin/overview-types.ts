import type { AttentionItem } from '@/lib/admin-derive/attention';
import type { cmAggregate } from '@/lib/admin-derive/cm-pulse';

export type OverviewPayload = {
  customers: Array<{
    id: string;
    business_name: string;
    account_manager: string | null;
    account_manager_profile_id: string | null;
    monthly_price: number | null;
    status: string | null;
    created_at: string | null;
    agreed_at: string | null;
    last_upload_at: string | null;
    upload_schedule: string[] | null;
    concepts_per_week: number | null;
    expected_concepts_per_week?: number | null;
    planned_concepts_count?: number | null;
    overdue_7d_concepts_count?: number | null;
    paused_until: string | null;
    onboarding_state: 'invited' | 'cm_ready' | 'live' | 'settled' | null;
    onboarding_state_changed_at: string | null;
    tiktok_handle: string | null;
  }>;
  team: Array<{
    id: string;
    name: string;
    email: string | null;
    profile_id: string | null;
    avatar_url: string | null;
    color?: string | null;
  }>;
  interactions: Array<{
    cm_id: string | null;
    customer_id: string | null;
    type: string | null;
    created_at: string | null;
  }>;
  bufferRows: Array<{
    customer_id: string;
    assigned_cm_id: string | null;
    concepts_per_week: number | null;
    paused_until: string | null;
    latest_planned_publish_date: string | null;
    last_published_at: string | null;
  }>;
  invoices: Array<{
    id: string;
    stripe_invoice_id?: string | null;
    invoice_number?: string | null;
    hosted_invoice_url?: string | null;
    customer_name?: string;
    customer_id?: string;
    amount_due: number;
    due_date: string | null;
    status: string;
  }>;
  scheduledAssignmentChanges: Array<{
    customer_id: string;
    customer_name: string;
    current_cm_id: string | null;
    current_cm_name: string | null;
    next_cm_id: string | null;
    next_cm_name: string | null;
    next_cm_email: string | null;
    effective_date: string;
    handover_note: string | null;
  }>;
  subscriptions: Array<{
    id?: string;
    status: string;
    amount: number;
    created?: string | null;
    created_at?: string | null;
    canceled_at?: string | null;
    cancel_at_period_end?: boolean | null;
    customer_name?: string;
    current_period_end?: string | null;
  }>;
  billingHealth: {
    environment: 'test' | 'live';
    stats: {
      failedSyncs: number;
      mirroredInvoices: number;
      mirroredSubscriptions: number;
      latestSuccessfulSyncAt: string | null;
    };
  } | null;
  serviceCosts: {
    entries: Array<{
      service: string;
      calls_30d: number;
      // cost_30d is always expressed in ore.
      cost_30d: number;
      trend: number[];
      quota?: {
        used: number;
        limit: number;
        reset_at: string | null;
      } | null;
    }>;
    totalOre: number;
  };
  demos: {
    sent: number;
    converted: number;
    demos: Array<{
      id: string;
      company_name: string;
      contact_name: string | null;
      contact_email: string | null;
      tiktok_handle: string | null;
      proposed_concepts_per_week: number | null;
      proposed_price_ore: number | null;
      status:
        | 'draft'
        | 'sent'
        | 'opened'
        | 'responded'
        | 'won'
        | 'lost'
        | 'expired';
      status_changed_at: string;
      responded_at: string | null;
      resolved_at: string | null;
      owner_admin_id: string | null;
    }>;
  };
  cmNotifications: Array<{
    id: string;
    from_cm_id: string;
    customer_id: string | null;
    message: string;
    priority: 'normal' | 'urgent';
    created_at: string;
    resolved_at: string | null;
  }>;
  attentionSnoozes: Array<{
    subject_type:
      | 'invoice'
      | 'onboarding'
      | 'cm_notification'
      | 'customer_blocking'
      | 'demo_response'
      | 'cm_assignment'
      | 'subscription_pause_resume'
      | 'cm_activity';
    subject_id: string;
    snoozed_until: string | null;
    released_at: string | null;
  }>;
  absences: Array<{
    id: string;
    cm_id: string;
    customer_profile_id: string | null;
    backup_cm_id: string | null;
    absence_type:
      | 'vacation'
      | 'sick'
      | 'parental_leave'
      | 'training'
      | 'temporary_coverage'
      | 'other';
    compensation_mode: 'covering_cm' | 'primary_cm';
    starts_on: string;
    ends_on: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;
  creditNoteOperations: Array<{
    id: string;
    operation_type: string;
    status: string;
    requires_attention: boolean;
    attention_reason: string | null;
    error_message: string | null;
    source_invoice_id: string;
    customer_profile_id: string;
    amount_ore: number;
    created_at: string;
  }>;
  attentionFeedSeenAt?: string | null;
};

export type OverviewMetricCard = {
  label: string;
  value: string;
  sub?: string;
  delta?: {
    text: string;
    tone: 'success' | 'muted' | 'destructive';
  };
  trend?: number[];
};

export type OverviewDerivedPayload = {
  metrics: {
    revenueCard: OverviewMetricCard;
    activeCard: OverviewMetricCard;
    demosCard: OverviewMetricCard;
    costsCard: OverviewMetricCard;
  };
  cmPulse: Array<{
    member: OverviewPayload['team'][number];
    aggregate: ReturnType<typeof cmAggregate>;
  }>;
  topAttention: AttentionItem[];
  attentionItems: AttentionItem[];
  snoozedAttentionItems: AttentionItem[];
  snoozedCount: number;
  costs: {
    entries: OverviewPayload['serviceCosts']['entries'];
    totalOre: number;
  };
  attentionFeedSeenAt: string | null;
};
