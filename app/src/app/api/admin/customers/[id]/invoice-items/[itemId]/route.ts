import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { deletePendingInvoiceItem } from '@/lib/stripe/admin-billing';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

export const DELETE = withAuth(async (_request: NextRequest, _user, { params }: RouteParams) => {
  const { id, itemId } = await params;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: profile, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('stripe_customer_id')
    .eq('id', id)
    .single();

  if (error || !profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'Kunden saknar Stripe customer' }, { status: 404 });
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const invoiceItem = await stripe.invoiceItems.retrieve(itemId);
  const invoiceItemCustomerId =
    typeof invoiceItem.customer === 'string'
      ? invoiceItem.customer
      : invoiceItem.customer?.id || null;

  if (invoiceItemCustomerId !== profile.stripe_customer_id) {
    return NextResponse.json({ error: 'Fakturatillagget tillhor inte kunden' }, { status: 403 });
  }

  await deletePendingInvoiceItem({
    supabaseAdmin,
    stripeClient: stripe,
    itemId,
  });

  return NextResponse.json({ success: true });
}, ['admin']);
