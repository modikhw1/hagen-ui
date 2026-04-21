import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { inferFirstInvoiceBehavior } from '@/lib/billing/first-invoice';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { sendCustomerInvite } from '@/lib/customers/invite';
import { stripe } from '@/lib/stripe/dynamic-config';
import { getAppUrl } from '@/lib/url/public';
import { z } from 'zod';

const convertDemoSchema = z.object({
  send_invite: z.boolean().optional().default(false),
  billing_day_of_month: z.number().int().min(1).max(28).optional(),
  contract_start_date: z.string().trim().optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = convertDemoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Ogiltig payload' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: existingCustomer } = await supabase
    .from('customer_profiles')
    .select('id, business_name, status')
    .eq('from_demo_id', id)
    .maybeSingle();

  if (existingCustomer) {
    return NextResponse.json(
      { error: 'Demo ar redan konverterad', customer: existingCustomer },
      { status: 409 },
    );
  }

  const { data: demo, error: demoError } = await supabase
    .from('demos')
    .select('*')
    .eq('id', id)
    .single();

  if (demoError || !demo) {
    return NextResponse.json({ error: demoError?.message || 'Demo hittades inte' }, { status: 404 });
  }

  const billingDay = parsed.data.billing_day_of_month ?? 25;
  const contractStartDate = parsed.data.contract_start_date || new Date().toISOString().slice(0, 10);
  const monthlyPriceSek = demo.proposed_price_ore == null ? 0 : Math.round(demo.proposed_price_ore / 100);
  const pricingStatus = demo.proposed_price_ore == null ? 'unknown' : 'fixed';
  const firstInvoiceBehavior = inferFirstInvoiceBehavior({
    startDate: contractStartDate,
    billingDay,
    waiveDaysUntilBilling: false,
  });

  const { data: customer, error: customerError } = await supabase
    .from('customer_profiles')
    .insert({
      business_name: demo.company_name,
      contact_email: demo.contact_email,
      customer_contact_name: demo.contact_name,
      tiktok_handle: demo.tiktok_handle,
      tiktok_profile_pic_url: demo.tiktok_profile_pic_url,
      concepts_per_week: demo.proposed_concepts_per_week ?? 3,
      monthly_price: monthlyPriceSek,
      pricing_status: pricingStatus,
      contract_start_date: contractStartDate,
      billing_day_of_month: billingDay,
      first_invoice_behavior: firstInvoiceBehavior,
      from_demo_id: demo.id,
      status: 'pending',
    })
    .select()
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: customerError?.message || 'Kunde inte skapa kund' }, { status: 500 });
  }

  const ownerAdminId = await resolveTeamMemberIdForProfile(user.id, supabase);
  const now = new Date().toISOString();
  const { data: updatedDemo, error: demoUpdateError } = await supabase
    .from('demos')
    .update({
      status: 'won',
      owner_admin_id: demo.owner_admin_id ?? ownerAdminId,
      status_changed_at: now,
      responded_at: demo.responded_at ?? now,
      resolved_at: now,
    })
    .eq('id', demo.id)
    .select()
    .single();

  if (demoUpdateError) {
    return NextResponse.json({ error: demoUpdateError.message }, { status: 500 });
  }

  let inviteSent = false;
  let inviteWarning: string | null = null;
  if (parsed.data.send_invite && customer.contact_email) {
    const inviteResult = await sendCustomerInvite({
      supabaseAdmin: supabase,
      stripeClient: stripe,
      profileId: customer.id,
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
        scope_items: Array.isArray(customer.scope_items) ? customer.scope_items.filter((item: unknown): item is string => typeof item === 'string') : [],
        subscription_interval: customer.subscription_interval === 'quarter' || customer.subscription_interval === 'year'
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

  return NextResponse.json({
    customer,
    demo: updatedDemo,
    invite_sent: inviteSent,
    warning: inviteWarning,
  });
}, ['admin']);
