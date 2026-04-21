import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { syncCustomerHistory } from '@/lib/studio/sync-customer-history';

const STALENESS_HOURS = 1;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        throw error;
      }
      if (i === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }

  throw new Error('withRetry: unreachable');
}

function getCronSecret() {
  return process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';
}

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET ar inte konfigurerad.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Obehorig.' }, { status: 401 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json({ error: 'RAPIDAPI_KEY ar inte konfigurerad.' }, { status: 503 });
  }

  const delayMs = parseInt(process.env.TIKTOK_DELAY_MS ?? '500', 10);
  const supabase = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - STALENESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data: customers, error: queryError } = await supabase
    .from('customer_profiles')
    .select('id, tiktok_handle')
    .in('status', ['active', 'agreed'])
    .not('tiktok_handle', 'is', null)
    .neq('tiktok_handle', '')
    .or(`last_history_sync_at.is.null,last_history_sync_at.lt.${cutoff}`);

  if (queryError) {
    return NextResponse.json(
      { error: 'Kunde inte hamta kunder for TikTok-synk.' },
      { status: 500 },
    );
  }

  const eligible = (customers ?? []) as Array<{
    id: string;
    tiktok_handle: string;
  }>;

  let newClipsTotal = 0;
  let statsUpdatedTotal = 0;
  let reconciledTotal = 0;
  let nudgesCreatedTotal = 0;
  const errors: Array<{ customerId: string; step: string; error: string }> = [];

  for (const [index, customer] of eligible.entries()) {
    const handle = customer.tiktok_handle.trim().replace(/^@/, '');

    if (!handle) {
      errors.push({
        customerId: customer.id,
        step: 'syncCustomerHistory',
        error: 'ingen_tiktok_handle',
      });
      continue;
    }

    try {
      const result = await withRetry(() =>
        syncCustomerHistory(supabase, customer.id, handle, rapidApiKey, { mode: 'cron' }),
      );

      if (result.error === 'already_locked') {
        continue;
      }

      newClipsTotal += result.imported;
      statsUpdatedTotal += result.statsUpdated;
      if (result.reconciled) {
        reconciledTotal++;
      }
      if (result.nudgeCreated) {
        nudgesCreatedTotal++;
      }
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      const isRateLimit = message.includes('429') || message.toLowerCase().includes('rate limit');
      errors.push({
        customerId: customer.id,
        step: 'syncCustomerHistory',
        error: isRateLimit ? `rate_limited: ${message}` : `sync_fel: ${message}`,
      });
      continue;
    }

    if (delayMs > 0 && index < eligible.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return NextResponse.json({
    processed: eligible.length,
    new_clips: newClipsTotal,
    stats_updated: statsUpdatedTotal,
    reconciled: reconciledTotal,
    nudges_created: nudgesCreatedTotal,
    errors,
  });
};
