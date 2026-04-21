import { NextRequest, NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { deletePendingInvoiceItem } from '@/lib/stripe/admin-billing';
import { assertInvoiceItemBelongsToCustomer } from '@/lib/stripe/customer-access';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  const { id, itemId } = await params;
  const supabaseAdmin = createSupabaseAdmin();

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

  try {
    await assertInvoiceItemBelongsToCustomer(
      stripe,
      itemId,
      profile.stripe_customer_id
    );
  } catch {
    return NextResponse.json({ error: 'Fakturatillagget tillhor inte kunden' }, { status: 403 });
  }

  await deletePendingInvoiceItem({
    supabaseAdmin,
    stripeClient: stripe,
    itemId,
  });

  await recordAuditLog(supabaseAdmin, {
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'admin.invoice_item.deleted',
    entityType: 'customer_profile',
    entityId: id,
    metadata: {
      item_id: itemId,
    },
  });

  return NextResponse.json({ success: true });
}, ['admin']);
