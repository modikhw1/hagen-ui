import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { applyCustomerDiscount, removeCustomerDiscount } from '@/lib/stripe/admin-billing';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const discountSchema = z.object({
  type: z.enum(['percent', 'amount', 'free_period']),
  value: z.number().min(0),
  duration_months: z.number().int().min(1).max(36).nullable().optional(),
  ongoing: z.boolean().default(false),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(async (request: NextRequest, _user, { params }: RouteParams) => {
  const body = await request.json();
  const parsed = discountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
  }

  const { id } = await params;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
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

  return NextResponse.json(result);
}, ['admin']);

export const DELETE = withAuth(async (_request: NextRequest, _user, { params }: RouteParams) => {
  const { id } = await params;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const result = await removeCustomerDiscount({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: id,
  });

  return NextResponse.json(result);
}, ['admin']);
