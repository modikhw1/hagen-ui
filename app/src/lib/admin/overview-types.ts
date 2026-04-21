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
    paused_until: string | null;
    onboarding_state: 'invited' | 'cm_ready' | 'live' | 'settled' | null;
    onboarding_state_changed_at: string | null;
    tiktok_handle: string | null;
  }>;
  team: Array<{
    id: string;
    name: string;
    email: string | null;
    color: string | null;
    profile_id: string | null;
    avatar_url: string | null;
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
    customer_name?: string;
    customer_id?: string;
    amount_due: number;
    due_date: string | null;
    status: string;
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
      cost_30d: number;
      trend: number[];
    }>;
    total: number;
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
      | 'demo_response';
    subject_id: string;
    snoozed_until: string | null;
    released_at: string | null;
  }>;
};
