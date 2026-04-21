import { NextRequest, NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createManualInvoice } from '@/lib/stripe/admin-billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const createInvoiceSchema = z.object({
  customer_profile_id: z.string().uuid(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    amount: z.number().min(0),
  })).min(1),
  days_until_due: z.number().int().min(1).max(90).default(14),
  auto_finalize: z.boolean().default(true),
}).strict();

export const POST = withAuth(async (request: NextRequest, user) => {
  requireAdminScope(
    user,
    'super_admin',
    'Endast super-admin kan skapa manuella fakturor',
  );

  const body = await request.json();
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const invoice = await createManualInvoice({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: parsed.data.customer_profile_id,
    items: parsed.data.items.map((item) => ({
      description: item.description,
      amountSek: item.amount,
    })),
    daysUntilDue: parsed.data.days_until_due,
    autoFinalize: parsed.data.auto_finalize,
  });

  await recordAuditLog(supabaseAdmin, {
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'admin.invoice.created',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: {
      customer_profile_id: parsed.data.customer_profile_id,
      item_count: parsed.data.items.length,
      days_until_due: parsed.data.days_until_due,
      auto_finalize: parsed.data.auto_finalize,
    },
  });

  return NextResponse.json({ invoice });
}, ['admin']);
