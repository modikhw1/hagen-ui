import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { subscriptionPriceChangeSchema } from '@/lib/schemas/billing';
import { previewSubscriptionPriceChange } from '@/lib/stripe/admin-billing';
import { stripe } from '@/lib/stripe/dynamic-config';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/** @deprecated Prefer app/admin/_actions/billing.previewSubscriptionPrice for new callers. */
export const POST = withAuth(
  async (
    request: NextRequest,
    _user,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const parsed = subscriptionPriceChangeSchema.safeParse(await request.json());

    if (!parsed.success) {
      return jsonError('Ogiltig payload', 400, {
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const preview = await previewSubscriptionPriceChange({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
      monthlyPriceSek: parsed.data.monthly_price,
      mode: parsed.data.mode,
    });

    return NextResponse.json(
      { preview },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=10',
        },
      },
    );
  },
  ['admin'],
);
