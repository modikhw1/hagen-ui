import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { applyCustomerDiscount, removeCustomerDiscount } from '@/lib/stripe/admin-billing';
import { customerDiscountSchema } from '@/lib/schemas/customer-discount';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, _user, { params }: RouteParams) => {
  try {
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

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte spara rabatt',
      500,
    );
  }
}, ['admin']);

export const DELETE = withAuth(async (_request: NextRequest, _user, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const supabaseAdmin = createSupabaseAdmin();
    const result = await removeCustomerDiscount({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte ta bort rabatt',
      500,
    );
  }
}, ['admin']);
