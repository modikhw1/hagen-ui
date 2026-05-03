import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import {
  deletePendingInvoiceItem,
  updatePendingInvoiceItem,
} from '@/lib/stripe/admin-billing';
import { assertInvoiceItemBelongsToCustomer } from '@/lib/stripe/customer-access';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    amount: z.number().min(0).optional(),
    unit_amount: z.number().min(0).optional(),
    quantity: z.number().int().min(1).default(1),
    internal_note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((value) => value.unit_amount != null || value.amount != null, {
    message: 'Belopp saknas',
    path: ['unit_amount'],
  })
  .strict();

export const PATCH = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  requireAdminScope(
    user,
    'super_admin',
    'Endast super-admin kan uppdatera vantande fakturaposter',
  );

  const body = await request.json();
  const parsed = invoiceItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
  }

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

  try {
    const item = await updatePendingInvoiceItem({
      supabaseAdmin,
      stripeClient: stripe,
      itemId,
      input: {
        description: parsed.data.description,
        unitAmountSek: parsed.data.unit_amount ?? parsed.data.amount ?? 0,
        quantity: parsed.data.quantity,
        metadata: parsed.data.internal_note
          ? { internal_note: parsed.data.internal_note }
          : undefined,
      },
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.invoice_item.updated',
      entityType: 'customer_profile',
      entityId: id,
      metadata: {
        item_id: item.id,
        description: parsed.data.description,
        unit_amount: parsed.data.unit_amount ?? parsed.data.amount ?? 0,
        quantity: parsed.data.quantity,
        internal_note: parsed.data.internal_note,
      },
    });

    revalidateAdminCustomerViews(id);

    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Okant fel';
    return NextResponse.json(
      {
        error: 'Kunde inte uppdatera vantande fakturapost',
        details: message,
      },
      { status: 502 },
    );
  }
}, ['admin']);

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  requireAdminScope(
    user,
    'super_admin',
    'Endast super-admin kan ta bort väntande fakturaposter',
  );

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

  revalidateAdminCustomerViews(id);

  return NextResponse.json({ success: true });
}, ['admin']);
