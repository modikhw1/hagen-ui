import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { previewSubscriptionPriceChange } from '@/lib/stripe/admin-billing';
import { stripe } from '@/lib/stripe/dynamic-config';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const requestSchema = z
  .object({
    monthly_price: z.number().min(0).max(1_000_000),
    mode: z.enum(['now', 'next_period']),
  })
  .strict();

export const POST = withAuth(
  async (
    request: NextRequest,
    _user,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const parsed = requestSchema.safeParse(await request.json());

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

    return jsonOk({ preview });
  },
  ['admin'],
);
