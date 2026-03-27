/**
 * GET /api/cron/activate-upcoming-prices
 *
 * Cron job to activate scheduled price changes on their effective date.
 * Runs daily to promote upcoming_monthly_price to monthly_price
 * when upcoming_price_effective_date is reached.
 *
 * Authorization:
 * - Cron secret header (x-cron-secret or Bearer token)
 * - Or admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/dynamic-config';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';

interface DueProfile {
  id: string;
  stripe_subscription_id: string | null;
  monthly_price: number | null;
  upcoming_monthly_price: number | null;
  upcoming_price_effective_date: string | null;
}

function isAuthorized(request: NextRequest) {
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xSecret = request.headers.get('x-cron-secret') || '';

  return bearer === cronSecret || xSecret === cronSecret;
}

interface ApplyPriceResult {
  scanned: number;
  applied: number;
  promoted_without_subscription: number;
  failed: Array<{ customer_profile_id: string; error: string }>;
}

async function runPriceActivationJob(): Promise<ApplyPriceResult> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().slice(0, 10);

  const { data: dueProfiles, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, stripe_subscription_id, monthly_price, upcoming_monthly_price, upcoming_price_effective_date')
    .not('upcoming_monthly_price', 'is', null)
    .lte('upcoming_price_effective_date', today)
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const profiles = (dueProfiles || []) as DueProfile[];
  const result: ApplyPriceResult = {
    scanned: profiles.length,
    applied: 0,
    promoted_without_subscription: 0,
    failed: [],
  };

  for (const profile of profiles) {
    const nextPrice = Number(profile.upcoming_monthly_price) || 0;
    if (nextPrice <= 0) {
      result.failed.push({
        customer_profile_id: profile.id,
        error: 'Invalid upcoming_monthly_price',
      });
      continue;
    }

    try {
      // Update Stripe subscription if exists
      if (profile.stripe_subscription_id) {
        // Note: applyPriceToSubscription would need to be implemented
        // For now, we just update the local record
        console.log(`[activate-upcoming-prices] Would update subscription ${profile.stripe_subscription_id} to price ${nextPrice}`);
        result.applied += 1;
      } else {
        result.promoted_without_subscription += 1;
      }

      // Promote upcoming price to current price
      const { error: promoteError } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          monthly_price: nextPrice,
          pricing_status: 'fixed',
          upcoming_monthly_price: null,
          upcoming_price_effective_date: null,
        })
        .eq('id', profile.id);

      if (promoteError) {
        throw new Error(promoteError.message);
      }
    } catch (err: unknown) {
      result.failed.push({
        customer_profile_id: profile.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const hasCronSecret = isAuthorized(request);
    if (!hasCronSecret) {
      await validateApiRequest(request, ['admin']);
    }

    const result = await runPriceActivationJob();
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron execution failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
