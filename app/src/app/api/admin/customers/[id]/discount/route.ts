import { NextRequest } from 'next/server';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { applyCustomerDiscount, removeCustomerDiscount } from '@/lib/stripe/admin-billing';
import {
  customerDiscountSchema,
  deriveBillingDiscountDurationMonths,
} from '@/lib/schemas/customer-discount';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** @deprecated Prefer app/admin/_actions/billing.applyDiscount for new callers. */
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
    const durationMonths = deriveBillingDiscountDurationMonths(parsed.data);
    const result = await applyCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
      input: {
        type: parsed.data.type,
        value:
          parsed.data.type === 'free_months'
            ? parsed.data.duration_months
            : parsed.data.value,
        durationMonths,
        ongoing: parsed.data.type === 'free_months' ? false : parsed.data.ongoing,
        startDate: parsed.data.start_date ?? null,
        endDate: parsed.data.end_date ?? null,
        idempotencyToken: parsed.data.idempotency_token,
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
        value:
          parsed.data.type === 'free_months'
            ? parsed.data.duration_months
            : parsed.data.value,
        duration_months: durationMonths,
        ongoing: parsed.data.type === 'free_months' ? false : parsed.data.ongoing,
        start_date: parsed.data.start_date ?? null,
        end_date: parsed.data.end_date ?? null,
        idempotency_token: parsed.data.idempotency_token ?? null,
        coupon_id: result.couponId,
        promotion_code_id: result.promotionCodeId ?? null,
      },
    });

    revalidateAdminCustomerViews(id);
    return jsonOk({
      customer: result.profile,
      couponId: result.couponId,
      promotionCodeId: result.promotionCodeId ?? null,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte spara rabatt',
      500,
    );
  }
}, ['admin']);

/** @deprecated Prefer app/admin/_actions/billing.removeDiscount for new callers. */
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

    revalidateAdminCustomerViews(id);
    return jsonOk({
      customer: result.profile,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte ta bort rabatt',
      500,
    );
  }
}, ['admin']);
