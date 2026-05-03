/**
 * GET /api/cron/activate-upcoming-prices
 *
 * Cron job for billing maintenance.
 * Runs daily to:
 * - resume paused subscriptions when pause date has passed
 * - remove discounts that have passed their inclusive end date
 * - apply scheduled CM assignment changes
 *
 * NOTE: Pris-aktivering vid period_end hanteras numera atomärt av
 * Stripe subscriptionSchedule (se applySubscriptionPriceChange i
 * admin-billing.ts). Webhook-flödet (subscription_schedule.* +
 * promoteUpcomingPriceIfSubscriptionMatches) rensar
 * upcoming_monthly_price när Stripe rullar fram nästa fas.
 * Cron-jobbet tar därför inte längre hand om prisbyten — det skulle
 * bara introducera dubbla pris-objekt och race-villkor mot webhook.
 *
 * Authorization:
 * - Cron secret header (x-cron-secret or Bearer token)
 * - Or admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';
import { applyScheduledAssignmentChanges } from '@/lib/admin/cm-assignments';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import {
  removeCustomerDiscount,
  resumeCustomerSubscription,
} from '@/lib/stripe/admin-billing';
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

interface ResumePauseResult {
  scanned: number;
  resumed: number;
  failed: Array<{ customer_profile_id: string; error: string }>;
}

interface ExpiredDiscountProfile {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  discount_type: 'none' | 'percent' | 'amount' | 'free_months' | null;
  discount_end_date: string | null;
}

interface DiscountExpiryResult {
  scanned: number;
  expired: number;
  cleared_without_stripe_link: number;
  failed: Array<{ customer_profile_id: string; error: string }>;
}

async function runResumePausedSubscriptionsJob(): Promise<ResumePauseResult> {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().slice(0, 10);
  const result: ResumePauseResult = {
    scanned: 0,
    resumed: 0,
    failed: [],
  };

  const pausedProfiles = await supabaseAdmin
    .from('customer_profiles')
    .select('id, stripe_subscription_id, monthly_price, paused_until, upcoming_monthly_price, upcoming_price_effective_date')
    .not('stripe_subscription_id', 'is', null)
    .not('paused_until', 'is', null)
    .lte('paused_until', today)
    .limit(200);

  if (pausedProfiles.error) {
    throw new Error(pausedProfiles.error.message);
  }

  result.scanned = pausedProfiles.data?.length ?? 0;

  for (const profile of pausedProfiles.data ?? []) {
    try {
      await resumeCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: profile.id,
      });

      const { error: updateError } = await supabaseAdmin
        .from('customer_profiles')
        .update({ paused_until: null } as never)
        .eq('id', profile.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: profile.id,
        profile: {
          id: profile.id,
          stripe_subscription_id: profile.stripe_subscription_id,
          paused_until: null,
          monthly_price: Number(profile.monthly_price) || 0,
          upcoming_monthly_price: Number(profile.upcoming_monthly_price) || null,
          upcoming_price_effective_date: profile.upcoming_price_effective_date,
        },
      });

      result.resumed += 1;
    } catch (error: unknown) {
      result.failed.push({
        customer_profile_id: profile.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

async function runDiscountExpiryJob(): Promise<DiscountExpiryResult> {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().slice(0, 10);
  const result: DiscountExpiryResult = {
    scanned: 0,
    expired: 0,
    cleared_without_stripe_link: 0,
    failed: [],
  };

  const dueDiscounts = await supabaseAdmin
    .from('customer_profiles')
    .select('id, stripe_customer_id, stripe_subscription_id, discount_type, discount_end_date')
    .not('discount_end_date', 'is', null)
    .neq('discount_type', 'none')
    .lt('discount_end_date', today)
    .limit(200);

  if (dueDiscounts.error) {
    throw new Error(dueDiscounts.error.message);
  }

  const profiles = (dueDiscounts.data ?? []) as ExpiredDiscountProfile[];
  result.scanned = profiles.length;

  for (const profile of profiles) {
    try {
      await removeCustomerDiscount({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: profile.id,
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: null,
        actorRole: 'system',
        action: 'system.customer.discount_expired',
        entityType: 'customer_profile',
        entityId: profile.id,
        metadata: {
          customer_profile_id: profile.id,
          discount_type: profile.discount_type,
          discount_end_date: profile.discount_end_date,
          source: 'cron',
        },
      });

      revalidateAdminCustomerViews(profile.id);

      if (!profile.stripe_customer_id && !profile.stripe_subscription_id) {
        result.cleared_without_stripe_link += 1;
      }

      result.expired += 1;
    } catch (error: unknown) {
      result.failed.push({
        customer_profile_id: profile.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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

    const [pauseResumes, discountExpiry, scheduledAssignments] = await Promise.all([
      runResumePausedSubscriptionsJob(),
      runDiscountExpiryJob(),
      (async () => {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        return applyScheduledAssignmentChanges({ supabaseAdmin });
      })(),
    ]);

    return NextResponse.json({
      price_activation: {
        skipped: true,
        reason: 'Handled atomically by Stripe subscriptionSchedule at period_end',
      },
      pause_resumes: pauseResumes,
      discount_expiry: discountExpiry,
      scheduled_assignments: scheduledAssignments,
    });
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
