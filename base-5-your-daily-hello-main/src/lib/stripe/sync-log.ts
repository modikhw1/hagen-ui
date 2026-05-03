import type { SupabaseClient } from '@supabase/supabase-js';
import { stripeEnvironment } from './dynamic-config';

export type StripeSyncStatus =
  | 'success'
  | 'failed'
  | 'skipped'
  | 'in_progress';
export type StripeSyncDirection = 'stripe_to_supabase' | 'supabase_to_stripe';

function isMissingRelationError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('relation') &&
    message.toLowerCase().includes('does not exist')
  );
}

export async function hasProcessedStripeEvent(
  supabaseAdmin: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabaseAdmin
    .from('stripe_processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) return false;
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function markStripeEventProcessed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  eventType: string
) {
  const { error } = await supabaseAdmin.from('stripe_processed_events').upsert(
    {
      event_id: eventId,
      event_type: eventType,
    } as never,
    { onConflict: 'event_id' }
  );

  if (error && !isMissingRelationError(error.message)) {
    throw new Error(error.message);
  }
}

export async function logStripeSync(params: {
  supabaseAdmin: SupabaseClient;
  eventId?: string | null;
  eventType: string;
  objectType?: string | null;
  objectId?: string | null;
  syncDirection?: StripeSyncDirection | null;
  status: StripeSyncStatus;
  errorMessage?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  environment?: 'test' | 'live' | null;
  customerProfileId?: string | null;
  source?: 'webhook' | 'manual_resync' | 'reconcile_job' | 'app_action' | null;
  appliedChanges?: Record<string, unknown> | null;
}) {
  const { error } = await params.supabaseAdmin.from('stripe_sync_log').insert({
    stripe_event_id: params.eventId ?? null,
    event_id: params.eventId ?? null,
    event_type: params.eventType,
    object_type: params.objectType ?? null,
    object_id: params.objectId ?? null,
    sync_direction: params.syncDirection ?? null,
    status: params.status,
    error_message: params.errorMessage ?? null,
    payload_summary: params.payloadSummary ?? null,
    environment: params.environment ?? stripeEnvironment,
  } as never);

  if (error && !isMissingRelationError(error.message)) {
    throw new Error(error.message);
  }

  // Skriv även till nya stripe_sync_events (cockpit-vyn läser härifrån).
  // Mappa legacy-statusar till nya enum-värden.
  const mappedStatus =
    params.status === 'success'
      ? 'applied'
      : params.status === 'in_progress'
        ? 'received'
        : params.status; // 'failed' | 'skipped'

  const { error: eventsError } = await params.supabaseAdmin
    .from('stripe_sync_events' as never)
    .insert({
      stripe_event_id: params.eventId ?? null,
      event_type: params.eventType,
      object_type: params.objectType ?? null,
      object_id: params.objectId ?? null,
      customer_profile_id: params.customerProfileId ?? null,
      source: params.source ?? 'webhook',
      status: mappedStatus,
      applied_changes: params.appliedChanges ?? {},
      raw_payload: params.payloadSummary ?? null,
      error_message: params.errorMessage ?? null,
      processed_at: mappedStatus === 'received' ? null : new Date().toISOString(),
      environment: params.environment ?? stripeEnvironment,
    } as never);

  if (eventsError && !isMissingRelationError(eventsError.message)) {
    // Logga men kasta inte – ny tabell ska inte bryta webhook
    console.error('[stripe_sync_events] insert failed:', eventsError.message);
  }
}
