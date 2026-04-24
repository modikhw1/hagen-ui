import { NextRequest, NextResponse } from 'next/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { formatDateOnly } from '@/lib/admin/billing-periods';
import { convertDemoInputSchema } from '@/lib/admin/schemas/demos';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import { sendCustomerInvite } from '@/lib/customers/invite';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { stripe } from '@/lib/stripe/dynamic-config';
import { getAppUrl } from '@/lib/url/public';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  requireScope(user, 'demos.write');

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = convertDemoInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Ogiltig payload' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  const ownerAdminId = await resolveTeamMemberIdForProfile(user.id, supabase);
  if (!ownerAdminId) {
    return NextResponse.json(
      { error: 'Kunde inte koppla demo\u00e4gare' },
      { status: 400 },
    );
  }

  const billingDay = parsed.data.billing_day_of_month ?? 25;
  const contractStartDate = parsed.data.contract_start_date || formatDateOnly(new Date());
  const idempotencyKey =
    request.headers.get('Idempotency-Key') || `${id}:${user.id}:${contractStartDate}:${billingDay}`;

  type ConvertDemoRpcRow = {
    customer_id: string;
    demo_id: string;
    was_idempotent_replay: boolean;
  };

  const { data: rpcRows, error: rpcError } = await (supabase.rpc(
    'admin_convert_demo_to_customer' as never,
    {
      p_demo_id: id,
      p_owner_admin_id: ownerAdminId,
      p_billing_day: billingDay,
      p_contract_start_date: contractStartDate,
      p_idempotency_key: idempotencyKey,
    } as never,
  ) as unknown as Promise<{
    data: ConvertDemoRpcRow[] | null;
    error: { message?: string } | null;
  }>);

  if (rpcError) {
    const message = rpcError.message || 'Kunde inte konvertera demo';

    if (message.includes('demo_not_found')) {
      return NextResponse.json({ error: 'Demo hittades inte' }, { status: 404 });
    }

    if (message.includes('demo_already_converted')) {
      return NextResponse.json({ error: 'Demo \u00e4r redan konverterad' }, { status: 409 });
    }

    if (message.includes('admin_convert_demo_to_customer')) {
      return NextResponse.json(
        {
          error: 'Konverterings-RPC saknas i databasen. K\u00f6r supporting flows-migrationen.',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  const rpcResult = rpcRows?.[0];
  if (!rpcResult?.customer_id) {
    return NextResponse.json(
      { error: 'Konverteringen gav inget kundresultat' },
      { status: 500 },
    );
  }

  const [{ data: customer, error: customerError }, { data: demo, error: demoError }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select(
        'id, business_name, contact_email, customer_contact_name, phone, invoice_text, scope_items, subscription_interval, upcoming_monthly_price, upcoming_price_effective_date, monthly_price, pricing_status, first_invoice_behavior',
      )
      .eq('id', rpcResult.customer_id)
      .single(),
    supabase.from('demos').select('*').eq('id', id).single(),
  ]);

  if (customerError || !customer) {
    return NextResponse.json(
      { error: customerError?.message || 'Kunde inte l\u00e4sa kunden' },
      { status: 500 },
    );
  }

  if (demoError || !demo) {
    return NextResponse.json(
      { error: demoError?.message || 'Kunde inte l\u00e4sa demon' },
      { status: 500 },
    );
  }

  const monthlyPriceSek = customer.monthly_price ?? 0;
  const pricingStatus = customer.pricing_status === 'fixed' ? 'fixed' : 'unknown';
  const firstInvoiceBehavior =
    customer.first_invoice_behavior === 'full' ||
    customer.first_invoice_behavior === 'free_until_anchor' ||
    customer.first_invoice_behavior === 'prorated'
      ? customer.first_invoice_behavior
      : inferFirstInvoiceBehavior({
          startDate: contractStartDate,
          billingDay,
          waiveDaysUntilBilling: false,
        });

  let inviteSent = false;
  let inviteWarning: string | null = null;
  if (parsed.data.send_invite && customer.contact_email && !rpcResult.was_idempotent_replay) {
    const inviteResult = await sendCustomerInvite({
      supabaseAdmin: supabase,
      stripeClient: stripe,
      profileId: customer.id,
      actorUserId: user.id,
      payload: {
        business_name: customer.business_name,
        contact_email: customer.contact_email,
        customer_contact_name: customer.customer_contact_name,
        account_manager: user.email,
        monthly_price: monthlyPriceSek,
        pricing_status: pricingStatus,
        contract_start_date: contractStartDate,
        billing_day_of_month: billingDay,
        first_invoice_behavior: firstInvoiceBehavior,
        waive_days_until_billing: false,
        discount_type: 'none',
        discount_value: 0,
        discount_duration_months: 1,
        phone: customer.phone,
        invoice_text: customer.invoice_text,
        scope_items: Array.isArray(customer.scope_items)
          ? customer.scope_items.filter((item: unknown): item is string => typeof item === 'string')
          : [],
        subscription_interval:
          customer.subscription_interval === 'quarter' || customer.subscription_interval === 'year'
            ? customer.subscription_interval
            : 'month',
        upcoming_monthly_price: customer.upcoming_monthly_price,
        upcoming_price_effective_date: customer.upcoming_price_effective_date,
      },
      appUrl: getAppUrl(),
    });

    if (inviteResult.ok) {
      inviteSent = true;
    } else {
      inviteWarning = inviteResult.error;
    }
  }

  await recordAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'demo.convert',
    entityType: 'demo',
    entityId: id,
    metadata: {
      customer_id: customer.id,
      invite_sent: inviteSent,
      warning: inviteWarning,
      was_idempotent_replay: rpcResult.was_idempotent_replay,
      idempotency_key: idempotencyKey,
    },
    afterState: demo as Record<string, unknown>,
  });

  return NextResponse.json({
    customer,
    demo,
    invite_sent: inviteSent,
    warning: inviteWarning,
    was_idempotent_replay: rpcResult.was_idempotent_replay,
  });
}, ['admin', 'content_manager']);
