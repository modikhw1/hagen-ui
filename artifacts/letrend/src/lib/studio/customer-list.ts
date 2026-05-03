import 'server-only';

import { normalizeStudioCustomerStatus } from '@/lib/studio/customer-status';
import { fetchCustomerTikTokSummaryMap } from '@/lib/tiktok/customer-runtime';
import type { Database } from '@/types/database';
import type { StudioCustomerGamePlanSummary, StudioCustomerListItem } from '@/types/studio-v2';
import type { SupabaseClient } from '@supabase/supabase-js';

type AppSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

function normalizeGamePlan(value: unknown): StudioCustomerGamePlanSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title : undefined,
    goals: Array.isArray(record.goals)
      ? record.goals.filter((goal): goal is string => typeof goal === 'string')
      : undefined,
  };
}

export async function fetchStudioCustomerList(params: {
  supabase: AppSupabaseClient;
}): Promise<StudioCustomerListItem[]> {
  const { data: profiles, error: profilesError } = await params.supabase
    .from('customer_profiles')
    .select(
      'id, business_name, contact_email, customer_contact_name, account_manager, account_manager_profile_id, monthly_price, status, created_at, game_plan, tiktok_handle, last_history_sync_at',
    )
    .order('created_at', { ascending: false });

  if (profilesError) {
    throw new Error(profilesError.message || 'Kunde inte ladda kunder');
  }

  const customerIds = (profiles ?? [])
    .map((profile) => (typeof profile.id === 'string' ? profile.id : null))
    .filter((value): value is string => Boolean(value));

  if (customerIds.length === 0) {
    return [];
  }

  const [tiktokSummaryMap, conceptsResult, emailsResult, signalsResult] = await Promise.all([
    fetchCustomerTikTokSummaryMap({
      supabase: params.supabase,
      customerIds,
    }),
    params.supabase
      .from('customer_concepts')
      .select('customer_profile_id, status')
      .in('customer_profile_id', customerIds)
      .neq('status', 'archived'),
    params.supabase
      .from('email_log')
      .select('customer_id, sent_at')
      .in('customer_id', customerIds)
      .not('sent_at', 'is', null),
    params.supabase
      .from('feed_motor_signals')
      .select('customer_id, payload, created_at')
      .in('customer_id', customerIds)
      .eq('signal_type', 'nudge')
      .is('acknowledged_at', null)
      .is('auto_resolved_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (conceptsResult.error) {
    throw new Error(conceptsResult.error.message || 'Kunde inte ladda konceptstatus');
  }

  if (emailsResult.error) {
    throw new Error(emailsResult.error.message || 'Kunde inte ladda e-posthistorik');
  }

  if (signalsResult.error) {
    throw new Error(signalsResult.error.message || 'Kunde inte ladda motorsignaler');
  }

  const conceptStatsMap: Record<string, StudioCustomerListItem['concept_stats']> = {};
  for (const row of conceptsResult.data ?? []) {
    const customerId =
      typeof row.customer_profile_id === 'string' ? row.customer_profile_id : null;
    if (!customerId) {
      continue;
    }

    if (!conceptStatsMap[customerId]) {
      conceptStatsMap[customerId] = { draft: 0, sent: 0, produced: 0 };
    }

    const status = typeof row.status === 'string' ? row.status : '';
    if (status === 'draft' || status === 'active') {
      conceptStatsMap[customerId].draft += 1;
    } else if (status === 'sent' || status === 'paused') {
      conceptStatsMap[customerId].sent += 1;
    } else if (status === 'produced' || status === 'completed') {
      conceptStatsMap[customerId].produced += 1;
    }
  }

  const lastEmailMap: Record<string, string> = {};
  for (const row of emailsResult.data ?? []) {
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : null;
    const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;
    if (!customerId || !sentAt) {
      continue;
    }

    if (!lastEmailMap[customerId] || sentAt > lastEmailMap[customerId]) {
      lastEmailMap[customerId] = sentAt;
    }
  }

  const activeSignalCounts: Record<string, number> = {};
  for (const row of signalsResult.data ?? []) {
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : null;
    if (!customerId || customerId in activeSignalCounts) {
      continue;
    }

    const payload =
      row.payload && typeof row.payload === 'object'
        ? (row.payload as { imported_count?: unknown })
        : {};

    activeSignalCounts[customerId] =
      typeof payload.imported_count === 'number' && Number.isFinite(payload.imported_count)
        ? payload.imported_count
        : 1;
  }

  return (profiles ?? []).map((profile) => {
    const customerId = String(profile.id);
    return {
      id: customerId,
      business_name: String(profile.business_name ?? ''),
      contact_email: typeof profile.contact_email === 'string' ? profile.contact_email : null,
      customer_contact_name:
        typeof profile.customer_contact_name === 'string' ? profile.customer_contact_name : null,
      account_manager: typeof profile.account_manager === 'string' ? profile.account_manager : null,
      account_manager_profile_id:
        typeof profile.account_manager_profile_id === 'string'
          ? profile.account_manager_profile_id
          : null,
      monthly_price: typeof profile.monthly_price === 'number' ? profile.monthly_price : null,
      status: normalizeStudioCustomerStatus(profile.status),
      created_at: typeof profile.created_at === 'string' ? profile.created_at : null,
      game_plan: normalizeGamePlan(profile.game_plan),
      tiktok_handle: typeof profile.tiktok_handle === 'string' ? profile.tiktok_handle : null,
      last_history_sync_at:
        typeof profile.last_history_sync_at === 'string' ? profile.last_history_sync_at : null,
      tiktok_summary: tiktokSummaryMap[customerId] ?? null,
      concept_stats: conceptStatsMap[customerId] ?? { draft: 0, sent: 0, produced: 0 },
      last_email_at: lastEmailMap[customerId] ?? null,
      active_signal_count: activeSignalCounts[customerId] ?? 0,
    };
  });
}
