import { unstable_cache } from 'next/cache';

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import {
  adminCustomerBillingTag,
  adminCustomerTag,
} from '@/lib/admin/cache-tags';
import { deriveCustomerStatus } from '@/lib/admin/customer-status';
import { listPendingInvoiceItems } from '@/lib/stripe/admin-billing';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import {
  buildCustomerTikTokPulseSummary,
  fetchCustomerTikTokRuntime,
} from '@/lib/tiktok/customer-runtime';
import type {
  CustomerOverviewInitialData,
  CustomerPulseInitialData,
} from '@/lib/admin/dtos/customer-drift';
import type {
  CustomerBillingInitialData, CustomerBillingInvoice,
} from '@/components/admin/customers/routes/CustomerBillingRoute';

export interface CustomerViewData {
  overview: CustomerOverviewInitialData;
  billing: CustomerBillingInitialData;
  pulse: CustomerPulseInitialData;
  organisation: {
    business_name: string;
    customer_contact_name: string | null;
    contact_email: string;
    contact_phone: string | null;
    tiktok_handle: string | null;
    tiktok_profile_pic_url: string | null;
    first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor';
    logo_url: string | null;
  };
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export async function loadCustomerView(customerId: string): Promise<CustomerViewData> {
  try {
    return await unstable_cache(
      async (): Promise<CustomerViewData> => {
        // ... (rest of the function)
      // Parallell hämtning — alla queries kör samtidigt.
      const [
        profileRes,
        subscriptionRes,
        invoicesRes,
        pendingItemsRes,
        activeAssignmentRes,
        pulseRes,
        tikTokRuntime,
      ] = await Promise.all([
        supabaseAdmin
          .from('customer_profiles')
          .select('*')
          .eq('id', customerId)
          .single(),
        supabaseAdmin
          .from('subscriptions')
          .select('status, current_period_end, environment, created')
          .eq('customer_profile_id', customerId)
          .order('created', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('v_admin_invoices')
          .select('*')
          .eq('customer_profile_id', customerId)
          .order('created_at', { ascending: false })
          .limit(50),
        // Vi vet att vissa vyer kan saknas, så vi hanterar dem defensivt.
        supabaseAdmin
          .from('pending_invoice_items' as any)
          .select('amount_ore')
          .eq('customer_profile_id', customerId)
          .then(res => res.error ? { data: [], error: null } : res),
        supabaseAdmin
          .from('cm_assignments' as any)
          .select('cm_id, valid_from, scheduled_change')
          .eq('customer_id', customerId)
          .is('valid_to', null)
          .order('valid_from', { ascending: false })
          .limit(1)
          .then(res => res.error ? { data: [], error: null } : res),
        supabaseAdmin
          .from('v_customer_pulse' as any)
          .select('*')
          .eq('customer_id', customerId)
          .maybeSingle()
          .then(res => res.error ? { data: null, error: null } : res),
        fetchCustomerTikTokRuntime({
          customerId,
          supabase: supabaseAdmin,
        }),
      ]);

      if (profileRes.error || !profileRes.data) {
        throw new Error(`Customer ${customerId} not found`);
      }
      const profile = profileRes.data as any;

      // Beräkna TikTok deltas
      const tiktokStats = buildCustomerTikTokPulseSummary(tikTokRuntime);
      const videoDescriptionByUrl = new Map(
        (tikTokRuntime.recent_videos_30d ?? [])
          .filter(
            (video) => typeof video.share_url === 'string' && typeof video.description === 'string',
          )
          .map((video) => [video.share_url as string, video.description as string]),
      );

      // Hämta prenumerationsstatus. 
      // Fallback till profilens fält om subscriptions-tabellen saknar rader (pga fördröjd spegling).
      const subscriptions = Array.isArray(subscriptionRes.data)
        ? subscriptionRes.data
        : [];
      const currentEnvSubscription =
        subscriptions.find(
          (subscription: any) =>
            subscription.environment === stripeEnvironment &&
            (subscription.status === 'active' || subscription.status === 'trialing'),
        ) ??
        subscriptions.find(
          (subscription: any) =>
            subscription.environment === stripeEnvironment,
        ) ??
        subscriptions[0] ??
        null;
      const subPeriodEnd = currentEnvSubscription?.current_period_end ?? null;
      const subStatus = currentEnvSubscription?.status ?? null;
      
      // Det mest relevanta datumet (Stripe först, sedan profil)
      const nextInvoiceDate = subPeriodEnd || profile.next_invoice_date;

      // Hämta CM-namn från team_members om ID finns
      const activeAssignment = Array.isArray(activeAssignmentRes.data)
        ? activeAssignmentRes.data[0] ?? null
        : null;
      const activeAssignmentCmId =
        typeof activeAssignment?.cm_id === 'string' ? activeAssignment.cm_id : null;
      const scheduledChange =
        activeAssignment?.scheduled_change &&
        typeof activeAssignment.scheduled_change === 'object' &&
        !Array.isArray(activeAssignment.scheduled_change)
          ? (activeAssignment.scheduled_change as Record<string, unknown>)
          : null;

      let accountManagerName = profile.account_manager;
      let accountManagerMemberId: string | null = activeAssignmentCmId;
      let accountManagerAvatarUrl: string | null = null;
      let accountManagerEmail: string | null = null;
      let accountManagerCity: string | null = null;
      let accountManagerCommissionRate: number | null = null;
      if (activeAssignmentCmId) {
        const { data: tm } = await supabaseAdmin
          .from('team_members')
          .select('id, name, email, avatar_url, city, commission_rate')
          .eq('id', activeAssignmentCmId)
          .maybeSingle();
        if (tm) {
          accountManagerName = tm.name ?? accountManagerName;
          accountManagerMemberId = tm.id ?? accountManagerMemberId;
          accountManagerAvatarUrl = tm.avatar_url ?? null;
          accountManagerEmail = tm.email ?? null;
          accountManagerCity = (tm as { city?: string | null }).city ?? null;
          accountManagerCommissionRate =
            typeof tm.commission_rate === 'number' ? tm.commission_rate : null;
        }
      } else if (profile.account_manager_profile_id) {
        const { data: tm } = await supabaseAdmin
          .from('team_members')
          .select('id, name, email, avatar_url, city, commission_rate')
          .eq('profile_id', profile.account_manager_profile_id)
          .maybeSingle();
        if (tm) {
          accountManagerName = tm.name ?? accountManagerName;
          accountManagerMemberId = tm.id ?? null;
          accountManagerAvatarUrl = tm.avatar_url ?? null;
          accountManagerEmail = tm.email ?? null;
          accountManagerCity = (tm as { city?: string | null }).city ?? null;
          accountManagerCommissionRate =
            typeof tm.commission_rate === 'number' ? tm.commission_rate : null;
        }
      }

      // Räkna ut next_invoice_estimate
      const mirroredPendingTotalOre = (pendingItemsRes.data ?? [])
        .reduce((sum: number, i: any) => sum + (i.amount_ore as number), 0);
      let pendingTotalOre = mirroredPendingTotalOre;
      if (profile.stripe_customer_id && stripe) {
        try {
          const stripePendingItems = await listPendingInvoiceItems({
            supabaseAdmin,
            stripeClient: stripe,
            profileId: customerId,
          });
          pendingTotalOre = stripePendingItems.reduce(
            (sum, item) => sum + item.amount_ore,
            0,
          );
        } catch (error) {
          console.warn('[customer-view] falling back to mirrored pending invoice items', {
            customerId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const monthlyPriceOre = Math.round(((profile.monthly_price as number | null) ?? 0) * 100);
      const nextInvoiceEstimateOre = monthlyPriceOre + pendingTotalOre;
      const latestPlannedPublishDate =
        (pulseRes.data?.latest_planned_publish_date as string | null | undefined) ??
        (profile.latest_planned_publish_date as string | null | undefined) ??
        null;
      const expectedConceptsPerWeek =
        (pulseRes.data?.expected_concepts_per_week as number | null | undefined) ??
        (profile.expected_concepts_per_week as number | null | undefined) ??
        null;
      const derivedStatus = deriveCustomerStatus({
        status: profile.status as string | null,
        archived_at: profile.archived_at as string | null,
        paused_until: profile.paused_until as string | null,
        invited_at: profile.invited_at as string | null,
        expected_concepts_per_week: expectedConceptsPerWeek,
        latest_planned_publish_date: latestPlannedPublishDate,
        escalation_flag: profile.escalation_flag as boolean | null,
        stripe_customer_id: profile.stripe_customer_id as string | null,
      });

      // Vilka fakturor har incomplete operations?
      const allInvoices = (invoicesRes.data ?? []) as any[];
      const currentEnvInvoices = allInvoices.filter((invoice) => invoice.environment === stripeEnvironment);
      const crossEnvInvoices = allInvoices.filter(
        (invoice) => invoice.environment && invoice.environment !== stripeEnvironment,
      );
      const invoiceIds = currentEnvInvoices.map((i: any) => i.stripe_invoice_id);
      const opsRes = invoiceIds.length > 0
        ? await supabaseAdmin
            .from('credit_note_operations')
            .select('source_invoice_id, requires_attention, status')
            .in('source_invoice_id', invoiceIds)
        : { data: [] as any[], error: null };
      const incompleteSet = new Set<string>(
        (opsRes.data ?? [])
          .filter((o: any) => o.requires_attention && o.status === 'failed')
          .map((o: any) => o.source_invoice_id),
      );

      const billingInvoices: CustomerBillingInvoice[] =
        currentEnvInvoices.map((i: any) => ({
          stripe_invoice_id: i.stripe_invoice_id,
          number: i.number,
          status: i.status,
          amount_due: i.amount_due,
          amount_paid: i.amount_paid,
          display_amount_ore:
            i.subtotal_ore ??
            i.total_ore ??
            Math.max(i.amount_due ?? 0, i.amount_paid ?? 0),
          currency: i.currency,
          created_at: i.created_at,
          hosted_invoice_url: i.hosted_invoice_url,
          has_incomplete_operation: incompleteSet.has(i.stripe_invoice_id),
        }));

      const overview: CustomerOverviewInitialData = {
        business_name: profile.business_name as string,
        status: (profile.status as 'active' | 'paused' | 'archived') ?? 'active',
        paused_until: (profile.paused_until as string | null) ?? null,
        monthly_price_ore: monthlyPriceOre,
        account_manager_id: (profile.account_manager_profile_id as string | null) ?? null,
        account_manager_member_id: accountManagerMemberId,
        account_manager_name: (accountManagerName as string | null) ?? null,
        account_manager_avatar_url: accountManagerAvatarUrl,
        account_manager_email: accountManagerEmail,
        account_manager_city: accountManagerCity,
        account_manager_commission_rate: accountManagerCommissionRate,
        account_manager_since:
          (activeAssignment?.valid_from as string | null | undefined) ?? null,
        scheduled_cm_change:
          scheduledChange &&
          typeof scheduledChange.effective_date === 'string'
            ? {
                effective_date: scheduledChange.effective_date,
                next_cm_name:
                  typeof scheduledChange.next_cm_name === 'string'
                    ? scheduledChange.next_cm_name
                    : null,
              }
            : null,
        next_invoice_estimate_ore: nextInvoiceEstimateOre,
        next_invoice_date: nextInvoiceDate,
        last_activity_at: (pulseRes.data?.last_cm_action_at as string | null) ?? null,
        last_activity_summary: (pulseRes.data?.last_cm_action_type as string | null) ?? null,
        stripe_customer_id: (profile.stripe_customer_id as string | null) ?? null,
        tiktok_handle:
          tikTokRuntime.profile?.tiktok_handle ??
          ((profile.tiktok_handle as string | null) ?? null),
        tiktok_profile_pic_url:
          tikTokRuntime.profile?.tiktok_profile_pic_url ??
          ((profile.tiktok_profile_pic_url as string | null) ?? null),
        derived_status: derivedStatus,
        invited_at: profile.invited_at,
      };

      const billing: CustomerBillingInitialData = {
        monthly_price_ore: monthlyPriceOre,
        pricing_status: (profile.pricing_status as string) ?? 'unknown',
        subscription_status: subStatus,
        stripe_customer_id: (profile.stripe_customer_id as string | null) ?? null,
        stripe_subscription_id:
          (profile.stripe_subscription_id as string | null) ?? null,
        next_invoice_date: nextInvoiceDate,
        invoices: billingInvoices,
        environment_warning:
          crossEnvInvoices.length > 0 && billingInvoices.length === 0
            ? {
                message: `Kunden har fakturadata i Stripe ${crossEnvInvoices[0].environment}, medan admin just nu visar ${stripeEnvironment}.`,
              }
            : null,
        discount: profile.discount_type && profile.discount_type !== 'none' ? {
          type: profile.discount_type,
          value: profile.discount_value,
          ends_at: profile.discount_ends_at
        } : null
      };

      // Hämta veckodagar från brief.posting_weekdays (det är här rytmen lagras i Studion)
      const briefDays = (profile.brief as any)?.posting_weekdays;
      const uploadSchedule = (Array.isArray(briefDays) && briefDays.length > 0)
        ? briefDays.map(String)
        : ['1', '4']; // Default Tis/Fre

      const pulse: CustomerPulseInitialData = {
        last_cm_action_at: (pulseRes.data?.last_cm_action_at as string | null) ?? null,
        last_cm_action_type: (pulseRes.data?.last_cm_action_type as string | null) ?? null,
        last_cm_action_by: (pulseRes.data?.last_cm_action_by as string | null) ?? null,
        planned_concepts_this_week:
          (pulseRes.data?.planned_concepts_this_week as number | null) ?? 0,
        expected_concepts_per_week:
          (pulseRes.data?.expected_concepts_per_week as number | null) ?? 0,
        delivered_concepts_this_week:
          (pulseRes.data?.delivered_concepts_this_week as number | null) ?? 0,
        recent_publications: ((pulseRes.data?.recent_publications as any[] | null) ?? []).map(
          (publication) => {
            const description =
              typeof publication?.url === 'string'
                ? truncateText(videoDescriptionByUrl.get(publication.url), 140)
                : null;
            const title =
              typeof publication?.title === 'string' && publication.title.trim()
                ? publication.title
                : description;

            return {
              ...publication,
              title: title ?? null,
              description,
            };
          },
        ),
        tiktok_stats: tiktokStats,
        upload_schedule: uploadSchedule,
      };

      const organisation = {
        business_name: profile.business_name as string,
        customer_contact_name: (profile.customer_contact_name as string | null) ?? null,
        contact_email: (profile.contact_email as string) || '',
        contact_phone: (profile.phone as string | null) ?? null,
        tiktok_handle:
          tikTokRuntime.profile?.tiktok_handle ??
          ((profile.tiktok_handle as string | null) ?? null),
        tiktok_profile_pic_url:
          tikTokRuntime.profile?.tiktok_profile_pic_url ??
          ((profile.tiktok_profile_pic_url as string | null) ?? null),
        first_invoice_behavior: (profile.first_invoice_behavior as any) || 'prorated',
        logo_url: (profile.logo_url as string | null) ?? null,
        status: profile.status as string,
      };
      return { overview, billing, pulse, organisation };
    },
    ['admin:customer:view', customerId],
    {
      tags: [
        adminCustomerTag(customerId),
        adminCustomerBillingTag(customerId),
        'admin:customer:detail',
        'admin:customer:billing',
        'admin:customer:pulse',
      ],
      revalidate: 60,
    },
  )();
} catch (err) {
  console.error('[ERROR] loadCustomerView failed:', err);
  throw err;
}
}
