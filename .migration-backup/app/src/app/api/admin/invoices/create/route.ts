import { NextRequest, NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { createManualInvoiceSchema } from '@/lib/admin/schemas/invoice-create';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createManualInvoice } from '@/lib/stripe/admin-billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  revalidateAdminBillingViews,
  revalidateAdminCustomerViews,
} from '@/lib/admin/cache-tags';

export const POST = withAuth(async (request: NextRequest, user) => {
  requireAdminScope(
    user,
    'super_admin',
    'Endast super-admin kan skapa manuella fakturor',
  );

  const body = await request.json();
  const parsed = createManualInvoiceSchema.safeParse(body);
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

  revalidateAdminCustomerViews(parsed.data.customer_profile_id);
  revalidateAdminBillingViews();

  return NextResponse.json({ invoice });
}, ['admin']);
