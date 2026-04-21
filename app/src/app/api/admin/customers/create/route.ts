import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { syncCustomerAssignmentFromProfile } from '@/lib/admin/cm-assignments';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { logCustomerCreated, logCustomerInvited } from '@/lib/activity/logger';
import { inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import { sendCustomerInvite } from '@/lib/customers/invite';
import { createCustomerSchema } from '@/lib/schemas/customer';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import { stripe } from '@/lib/stripe/dynamic-config';
import { deriveTikTokHandle, toCanonicalTikTokProfileUrl } from '@/lib/tiktok/profile';
import { getAppUrl } from '@/lib/url/public';
import type { TablesInsert } from '@/types/database';

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'operations_admin');

  try {
    const body = await request.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(issue?.message || 'Ogiltig data', 400, {
        field: typeof issue?.path?.[0] === 'string' ? issue.path[0] : undefined,
      });
    }

    const {
      send_invite,
      send_invite_now,
      waive_days_until_billing,
      account_manager,
      monthly_price,
      pricing_status,
      contract_start_date,
      billing_day_of_month,
      phone,
      tiktok_profile_url,
      ...rest
    } = parsed.data;

    const supabaseAdmin = createSupabaseAdmin();
    const assignment = await resolveAccountManagerAssignment(
      supabaseAdmin,
      account_manager,
    );
    const effectiveContractStartDate =
      contract_start_date || new Date().toISOString().slice(0, 10);
    const firstInvoiceBehavior = inferFirstInvoiceBehavior({
      startDate: effectiveContractStartDate,
      billingDay: billing_day_of_month,
      waiveDaysUntilBilling: waive_days_until_billing,
    });

    const canonicalTikTokProfileUrl = tiktok_profile_url
      ? toCanonicalTikTokProfileUrl(tiktok_profile_url)
      : null;
    const tiktokHandle = tiktok_profile_url ? deriveTikTokHandle(tiktok_profile_url) : null;

    if (tiktok_profile_url && (!canonicalTikTokProfileUrl || !tiktokHandle)) {
      return jsonError('Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.', 400, {
        field: 'tiktok_profile_url',
      });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .insert({
        ...rest,
        account_manager: assignment.accountManager,
        account_manager_profile_id: assignment.accountManagerProfileId,
        concepts_per_week: 2,
        monthly_price: pricing_status === 'unknown' ? 0 : monthly_price,
        pricing_status,
        contract_start_date,
        billing_day_of_month,
        first_invoice_behavior: firstInvoiceBehavior,
        phone: phone || null,
        tiktok_profile_url: canonicalTikTokProfileUrl,
        tiktok_handle: tiktokHandle,
        status: 'pending',
      } as TablesInsert<'customer_profiles'>)
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    await logCustomerCreated(user.id, user.email || 'unknown', data.id, data.business_name);
    await syncCustomerAssignmentFromProfile({
      supabaseAdmin,
      customerProfileId: data.id,
    });
    await syncOperationalSubscriptionState({
      supabaseAdmin,
      customerProfileId: data.id,
    });

    let customer = data;
    let inviteSent = false;
    const warnings: string[] = [];

    if (send_invite || send_invite_now) {
      const inviteResult = await sendCustomerInvite({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: data.id,
        payload: {
          ...rest,
          account_manager: assignment.accountManager,
          monthly_price: pricing_status === 'unknown' ? 0 : monthly_price,
          pricing_status,
          contract_start_date,
          billing_day_of_month,
          first_invoice_behavior: firstInvoiceBehavior,
          phone: phone || null,
          tiktok_profile_url: canonicalTikTokProfileUrl,
          waive_days_until_billing,
        },
        appUrl: getAppUrl(),
      });

      if (inviteResult.ok) {
        inviteSent = true;
        customer = inviteResult.profile as typeof data;
        await logCustomerInvited(
          user.id,
          user.email || 'unknown',
          data.id,
          data.business_name,
          data.contact_email || rest.contact_email,
        );
        await syncOperationalSubscriptionState({
          supabaseAdmin,
          customerProfileId: data.id,
        });
      } else {
        warnings.push(`Inbjudan kunde inte skickas: ${inviteResult.error}`);
      }
    }

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.created',
      entityType: 'customer_profile',
      entityId: data.id,
      afterState: customer as unknown as Record<string, unknown>,
      metadata: {
        invite_sent: inviteSent,
        warnings,
      },
    });

    return jsonOk({ customer, invite_sent: inviteSent, warnings }, 201);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}, ['admin']);
