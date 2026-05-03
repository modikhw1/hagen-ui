import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { previewSubscriptionCancellation } from '@/lib/stripe/admin-billing';
import { stripe } from '@/lib/stripe/dynamic-config';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const Body = z.object({
  mode: z.enum(['end_of_period', 'immediate', 'immediate_with_credit']),
});

/**
 * Read-only preview av effekten vid abonnemangsavslut.
 * Returnerar oanvända dagar, prorata-belopp och föreslagen kreditering.
 * Inga ändringar görs i Stripe.
 */
export const POST = withAuth(
  async (
    request: NextRequest,
    _user,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Ogiltig payload', 400);
    }

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const preview = await previewSubscriptionCancellation({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        mode: parsed.data.mode,
      });
      return NextResponse.json(
        { preview },
        {
          status: 200,
          headers: { 'Cache-Control': 'private, max-age=10' },
        },
      );
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte räkna ut preview',
        500,
      );
    }
  },
  ['admin'],
);