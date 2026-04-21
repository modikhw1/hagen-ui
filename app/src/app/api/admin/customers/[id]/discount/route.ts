import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { applyCustomerDiscount, removeCustomerDiscount } from '@/lib/stripe/admin-billing';
import { customerDiscountSchema } from '@/lib/schemas/customer-discount';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, user, { params }: RouteParams) => {
  try {
    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan hantera kundrabatter',
    );

    const body = await request.json();
    const parsed = customerDiscountSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Ogiltig payload', 400);
    }

    const { id } = await params;
    const supabaseAdmin = createSupabaseAdmin();
    const result = await applyCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
      input: {
        type: parsed.data.type,
        value: parsed.data.value,
        durationMonths: parsed.data.duration_months ?? null,
        ongoing: parsed.data.ongoing,
      },
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.discount_applied',
      entityType: 'customer_profile',
      entityId: id,
      metadata: {
        type: parsed.data.type,
        value: parsed.data.value,
        duration_months: parsed.data.duration_months ?? null,
        ongoing: parsed.data.ongoing,
        coupon_id: result.couponId,
      },
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte spara rabatt',
      500,
    );
  }
}, ['admin']);

export const DELETE = withAuth(async (_request: NextRequest, user, { params }: RouteParams) => {
  try {
    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan hantera kundrabatter',
    );

    const { id } = await params;
    const supabaseAdmin = createSupabaseAdmin();
    const result = await removeCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.customer.discount_removed',
      entityType: 'customer_profile',
      entityId: id,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte ta bort rabatt',
      500,
    );
  }
}, ['admin']);
