import { NextRequest, NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createPendingInvoiceItem, listPendingInvoiceItems } from '@/lib/stripe/admin-billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().min(0),
  currency: z.string().trim().min(3).max(3).default('sek'),
  internal_note: z.string().trim().max(1000).optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (_request: NextRequest, _user, { params }: RouteParams) => {
  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();
  const items = await listPendingInvoiceItems({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: id,
  });

  return NextResponse.json({ items });
}, ['admin']);

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  const body = await request.json();
  const parsed = invoiceItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
  }

  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();
  const item = await createPendingInvoiceItem({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: id,
    input: {
      description: parsed.data.description,
      amountSek: parsed.data.amount,
      currency: parsed.data.currency,
      metadata: parsed.data.internal_note ? { internal_note: parsed.data.internal_note } : undefined,
    },
  });

  await recordAuditLog(supabaseAdmin, {
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'admin.invoice_item.created',
    entityType: 'customer_profile',
    entityId: id,
    metadata: {
      item_id: item.id,
      description: parsed.data.description,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      internal_note: parsed.data.internal_note,
    },
  });

  return NextResponse.json({ item });
}, ['admin']);
