import 'server-only';

import { logCustomerCreated, logCustomerInvited } from '@/lib/activity/logger';
import { formatDateOnly } from '@/lib/admin/billing-periods';
import { inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import { sendCustomerInvite } from '@/lib/customers/invite';
import type { AuthenticatedUser } from '@/lib/auth/api-auth';
import { createCustomerServerSchema } from '@/lib/schemas/customer';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import { stripe } from '@/lib/stripe/dynamic-config';
import { syncOperationalSubscriptionState } from '@/lib/admin/subscription-operational-sync';
import { normalizeTikTokProfileIdentityInput } from '@/lib/tiktok/customer-profile-link';
import { getAppUrl } from '@/lib/url/public';
import type { Database, Tables } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

type CreateCustomerResult =
  | {
      ok: true;
      status: number;
      payload: {
        customer: Tables<'customer_profiles'>;
        invite_sent: boolean;
        profile_url: string;
        warnings: string[];
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      field?: string;
    };

type AdminCreateCustomerRpcPayload = {
  customer: Tables<'customer_profiles'>;
  assignment_created: boolean;
};

function buildCustomerProfileUrl(profileKey: string) {
  return `${getAppUrl()}/demo/${profileKey}`;
}

function slugifyBusinessName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'kund';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readDemoSlugFromProfileData(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const rawSlug = value.demo_slug;
  if (typeof rawSlug !== 'string') {
    return null;
  }

  const normalized = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return null;
  }

  return {
    raw: rawSlug,
    normalized,
  };
}

async function demoSlugExists(params: {
  supabaseAdmin: SupabaseClient<Database>;
  demoSlug: string;
  excludeCustomerId?: string;
}) {
  let query = params.supabaseAdmin
    .from('customer_profiles')
    .select('id')
    .filter('profile_data->>demo_slug', 'ilike', params.demoSlug)
    .limit(1);

  if (params.excludeCustomerId) {
    query = query.neq('id', params.excludeCustomerId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Kunde inte kontrollera demo-slug');
  }

  return Boolean(data?.length);
}

async function generateUniqueDemoSlug(params: {
  supabaseAdmin: SupabaseClient<Database>;
  businessName: string;
  customerId: string;
}) {
  const baseSlug = slugifyBusinessName(params.businessName);

  for (let suffix = 1; suffix <= 500; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const taken = await demoSlugExists({
      supabaseAdmin: params.supabaseAdmin,
      demoSlug: candidate,
      excludeCustomerId: params.customerId,
    });
    if (!taken) {
      return candidate;
    }
  }

  throw new Error('Kunde inte generera en unik demo-slug');
}

async function ensureCustomerDemoSlug(params: {
  supabaseAdmin: SupabaseClient<Database>;
  customer: Tables<'customer_profiles'>;
}) {
  const existingSlugRecord = readDemoSlugFromProfileData(params.customer.profile_data);
  if (existingSlugRecord) {
    const collision = await demoSlugExists({
      supabaseAdmin: params.supabaseAdmin,
      demoSlug: existingSlugRecord.normalized,
      excludeCustomerId: params.customer.id,
    });

    if (!collision) {
      const needsNormalization = existingSlugRecord.raw !== existingSlugRecord.normalized;
      if (!needsNormalization) {
        return {
          customer: params.customer,
          demoSlug: existingSlugRecord.normalized,
        };
      }

      const normalizedProfileData = {
        ...(isRecord(params.customer.profile_data) ? params.customer.profile_data : {}),
        demo_slug: existingSlugRecord.normalized,
      };
      const { data: normalizedCustomer, error: normalizedError } = await params.supabaseAdmin
        .from('customer_profiles')
        .update({
          profile_data: normalizedProfileData,
        })
        .eq('id', params.customer.id)
        .select('*')
        .single();

      if (normalizedError || !normalizedCustomer) {
        throw new Error(normalizedError?.message || 'Kunde inte normalisera demo-slug');
      }

      return {
        customer: normalizedCustomer as Tables<'customer_profiles'>,
        demoSlug: existingSlugRecord.normalized,
      };
    }
  }

  const demoSlug = await generateUniqueDemoSlug({
    supabaseAdmin: params.supabaseAdmin,
    businessName: params.customer.business_name,
    customerId: params.customer.id,
  });
  const nextProfileData = {
    ...(isRecord(params.customer.profile_data) ? params.customer.profile_data : {}),
    demo_slug: demoSlug,
  };

  const { data: updatedCustomer, error: updateError } = await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      profile_data: nextProfileData,
    })
    .eq('id', params.customer.id)
    .select('*')
    .single();

  if (updateError || !updatedCustomer) {
    throw new Error(updateError?.message || 'Kunde inte spara demo-slug');
  }

  return {
    customer: updatedCustomer as Tables<'customer_profiles'>,
    demoSlug,
  };
}

function isMissingAdminCreateCustomerRpc(message?: string | null) {
  const normalized = message?.toLowerCase() ?? '';
  return (
    normalized.includes('admin_create_customer') &&
    (normalized.includes('does not exist') || normalized.includes('could not find the function'))
  );
}

async function runAdminCreateCustomerTransaction(params: {
  supabaseAdmin: SupabaseClient<Database>;
  payload: {
    business_name: string;
    contact_email: string;
    customer_contact_name: string | null;
    phone: string | null;
    account_manager: string | null;
    account_manager_profile_id: string | null;
    monthly_price: number;
    pricing_status: 'fixed' | 'unknown';
    contract_start_date: string;
    billing_day_of_month: number;
    first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor';
    discount_type: 'none' | 'percent' | 'amount' | 'free_months';
    discount_value: number;
    discount_duration_months: number;
    discount_start_date: string | null;
    discount_end_date: string | null;
    upcoming_monthly_price: number | null;
    upcoming_price_effective_date: string | null;
    subscription_interval: 'month' | 'quarter' | 'year';
    invoice_text: string | null;
    scope_items: string[];
    price_start_date: string | null;
    price_end_date: string | null;
    contacts: unknown[];
    profile_data: Record<string, unknown>;
    game_plan: Record<string, unknown>;
    concepts: unknown[];
    tiktok_profile_url: string | null;
    tiktok_handle: string | null;
  };
  actor: AuthenticatedUser;
}): Promise<AdminCreateCustomerRpcPayload> {
  const { data, error } = await (params.supabaseAdmin.rpc(
    'admin_create_customer' as never,
    {
      p_business_name: params.payload.business_name,
      p_contact_email: params.payload.contact_email,
      p_customer_contact_name: params.payload.customer_contact_name,
      p_phone: params.payload.phone,
      p_account_manager: params.payload.account_manager,
      p_account_manager_profile_id: params.payload.account_manager_profile_id,
      p_monthly_price: params.payload.monthly_price,
      p_pricing_status: params.payload.pricing_status,
      p_contract_start_date: params.payload.contract_start_date,
      p_billing_day_of_month: params.payload.billing_day_of_month,
      p_first_invoice_behavior: params.payload.first_invoice_behavior,
      p_discount_type: params.payload.discount_type,
      p_discount_value: params.payload.discount_value,
      p_discount_duration_months: params.payload.discount_duration_months,
      p_discount_start_date: params.payload.discount_start_date,
      p_discount_end_date: params.payload.discount_end_date,
      p_upcoming_monthly_price: params.payload.upcoming_monthly_price,
      p_upcoming_price_effective_date: params.payload.upcoming_price_effective_date,
      p_subscription_interval: params.payload.subscription_interval,
      p_invoice_text: params.payload.invoice_text,
      p_scope_items: params.payload.scope_items,
      p_price_start_date: params.payload.price_start_date,
      p_price_end_date: params.payload.price_end_date,
      p_contacts: params.payload.contacts,
      p_profile_data: params.payload.profile_data,
      p_game_plan: params.payload.game_plan,
      p_concepts: params.payload.concepts,
      p_tiktok_profile_url: params.payload.tiktok_profile_url,
      p_tiktok_handle: params.payload.tiktok_handle,
      p_actor_user_id: params.actor.id,
      p_actor_email: params.actor.email,
      p_actor_role: params.actor.role,
    } as never,
  ) as unknown as Promise<{
    data: AdminCreateCustomerRpcPayload | null;
    error: { message?: string } | null;
  }>);

  if (error) {
    if (isMissingAdminCreateCustomerRpc(error.message)) {
      throw Object.assign(new Error('Skapa-kund-RPC saknas i databasen. Kör senaste migrationen.'), {
        statusCode: 409,
      });
    }

    throw new Error(error.message || 'Kunde inte skapa kund');
  }

  if (!data?.customer) {
    throw new Error('Skapa-kund-RPC returnerade inget kundobjekt');
  }

  return data;
}

export async function createAdminCustomer(params: {
  supabaseAdmin: SupabaseClient<Database>;
  user: AuthenticatedUser;
  body: unknown;
}): Promise<CreateCustomerResult> {
  const parsed = createCustomerServerSchema.safeParse(params.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: issue?.message || 'Ogiltig data',
      field: typeof issue?.path?.[0] === 'string' ? issue.path[0] : undefined,
    };
  }

  if (
    typeof params.body === 'object' &&
    params.body !== null &&
    'send_invite' in params.body
  ) {
    console.warn(
      'Legacy create-customer payload used send_invite. Use send_invite_now instead.',
    );
  }

  const {
    send_invite_now,
    waive_days_until_billing,
    account_manager,
    monthly_price,
    pricing_status,
    contract_start_date,
    billing_day_of_month,
    phone,
    tiktok_profile_url,
    customer_contact_name,
    business_name,
    contact_email,
    discount_type,
    discount_value,
    discount_duration_months,
    discount_start_date,
    discount_end_date,
    upcoming_monthly_price,
    upcoming_price_effective_date,
    subscription_interval,
    invoice_text,
    scope_items,
    price_start_date,
    price_end_date,
    contacts,
    profile_data,
    game_plan,
    concepts,
  } = parsed.data;

  // Idempotency-skydd: om samma admin precis skapade en kund med samma e-post
  // (inom 30s) returnerar vi den befintliga istället för att skapa en duplikat.
  // Detta skyddar mot dubbelklick, nätverks-retries och tabb-spam.
  try {
    const recencyCutoff = new Date(Date.now() - 30_000).toISOString();
    const { data: recentDuplicateRaw } = await params.supabaseAdmin
      .from('customer_profiles')
      .select('id, business_name, contact_email, created_at, profile_data, status' as never)
      .ilike('contact_email', contact_email.trim())
      .gte('created_at', recencyCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const recentDuplicate = recentDuplicateRaw as
      | (Tables<'customer_profiles'> & { lifecycle_state?: string | null })
      | null;

    if (recentDuplicate) {
      const slugRecord = readDemoSlugFromProfileData(recentDuplicate.profile_data);
      const profileUrl = slugRecord
        ? buildCustomerProfileUrl(slugRecord.normalized)
        : `${getAppUrl()}/admin/customers/${recentDuplicate.id}`;

      console.warn(
        `[createAdminCustomer] Idempotency hit: returning existing customer ${recentDuplicate.id} for email ${contact_email}`,
      );

      return {
        ok: true,
        status: 200,
        payload: {
          customer: recentDuplicate,
          invite_sent: recentDuplicate.lifecycle_state === 'invited',
          profile_url: profileUrl,
          warnings: ['Detta var en duplicerad förfrågan — befintlig kund returnerades.'],
        },
      };
    }
  } catch (idempotencyError) {
    // Idempotency-check får aldrig blockera den riktiga skapandet
    console.warn('[createAdminCustomer] Idempotency check failed (non-fatal):', idempotencyError);
  }

  try {
    const assignment = await resolveAccountManagerAssignment(
      params.supabaseAdmin,
      account_manager,
    );
    const effectiveContractStartDate =
      contract_start_date || formatDateOnly(new Date());
    const firstInvoiceBehavior = inferFirstInvoiceBehavior({
      startDate: effectiveContractStartDate,
      billingDay: billing_day_of_month,
      waiveDaysUntilBilling: waive_days_until_billing,
    });

    const tiktokIdentity = normalizeTikTokProfileIdentityInput(tiktok_profile_url ?? null);
    const canonicalTikTokProfileUrl = tiktokIdentity.ok
      ? tiktokIdentity.value.tiktok_profile_url
      : null;
    const tiktokHandle = tiktokIdentity.ok ? tiktokIdentity.value.tiktok_handle : null;

    if (!tiktokIdentity.ok) {
      return {
        ok: false,
        status: 400,
        error: 'Ogiltig TikTok-profil. Använd en profil-URL eller @handle.',
        field: 'tiktok_profile_url',
      };
    }

    const transactionResult = await runAdminCreateCustomerTransaction({
      supabaseAdmin: params.supabaseAdmin,
      actor: params.user,
      payload: {
        business_name,
        contact_email,
        customer_contact_name: customer_contact_name ?? null,
        phone: phone || null,
        account_manager: assignment.accountManager,
        account_manager_profile_id: assignment.accountManagerProfileId,
        monthly_price: pricing_status === 'unknown' ? 0 : monthly_price,
        pricing_status,
        contract_start_date: effectiveContractStartDate,
        billing_day_of_month,
        first_invoice_behavior: firstInvoiceBehavior,
        discount_type,
        discount_value,
        discount_duration_months,
        discount_start_date: discount_start_date ?? null,
        discount_end_date: discount_end_date ?? null,
        upcoming_monthly_price: upcoming_monthly_price ?? null,
        upcoming_price_effective_date: upcoming_price_effective_date ?? null,
        subscription_interval,
        invoice_text: invoice_text ?? null,
        scope_items,
        price_start_date: price_start_date ?? null,
        price_end_date: price_end_date ?? null,
        contacts,
        profile_data,
        game_plan,
        concepts,
        tiktok_profile_url: canonicalTikTokProfileUrl,
        tiktok_handle: tiktokHandle,
      },
    });

    const slugResult = await ensureCustomerDemoSlug({
      supabaseAdmin: params.supabaseAdmin,
      customer: transactionResult.customer,
    });
    let customer = slugResult.customer;
    const demoSlug = slugResult.demoSlug;
    let inviteSent = false;
    const warnings: string[] = [];

    await logCustomerCreated(
      params.user.id,
      params.user.email || 'unknown',
      customer.id,
      customer.business_name,
    );

    // Sätt lifecycle_state utifrån om invite skickas direkt eller ej.
    const initialLifecycle = send_invite_now ? 'invited' : 'draft';
    await params.supabaseAdmin
      .from('customer_profiles')
      .update({ lifecycle_state: initialLifecycle } as never)
      .eq('id', customer.id);

    if (send_invite_now) {
      const inviteResult = await sendCustomerInvite({
        supabaseAdmin: params.supabaseAdmin,
        stripeClient: stripe,
        profileId: customer.id,
        actorUserId: params.user.id,
        payload: {
          business_name,
          contact_email,
          customer_contact_name: customer_contact_name ?? null,
          phone: phone || null,
          tiktok_profile_url: canonicalTikTokProfileUrl,
          account_manager: assignment.accountManager,
          monthly_price: pricing_status === 'unknown' ? 0 : monthly_price,
          pricing_status,
          contract_start_date: effectiveContractStartDate,
          billing_day_of_month,
          first_invoice_behavior: firstInvoiceBehavior,
          waive_days_until_billing,
          discount_type,
          discount_value,
          discount_duration_months,
          discount_start_date: discount_start_date ?? null,
          discount_end_date: discount_end_date ?? null,
          upcoming_monthly_price: upcoming_monthly_price ?? null,
          upcoming_price_effective_date: upcoming_price_effective_date ?? null,
          subscription_interval,
          invoice_text: invoice_text ?? null,
          scope_items,
        },
        appUrl: getAppUrl(),
      });

      if (inviteResult.ok) {
        inviteSent = true;
        customer = inviteResult.profile as typeof customer;
        await logCustomerInvited(
          params.user.id,
          params.user.email || 'unknown',
          customer.id,
          customer.business_name,
          customer.contact_email || contact_email,
        );
        await syncOperationalSubscriptionState({
          supabaseAdmin: params.supabaseAdmin,
          customerProfileId: customer.id,
        });
      } else {
        warnings.push(`Inbjudan kunde inte skickas: ${inviteResult.error}`);
      }
    }

    return {
      ok: true,
      status: 201,
      payload: {
        customer,
        invite_sent: inviteSent,
        profile_url: buildCustomerProfileUrl(demoSlug),
        warnings,
      },
    };
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    return {
      ok: false,
      status,
      error: error instanceof Error ? error.message : 'Internt serverfel',
    };
  }
}
