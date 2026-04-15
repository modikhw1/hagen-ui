import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createPendingInvoiceItem, listPendingInvoiceItems } from '@/lib/stripe/admin-billing';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().min(0),
  currency: z.string().trim().min(3).max(3).default('sek'),
}).strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (_request: NextRequest, _user, { params }: RouteParams) => {
  const { id } = await params;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const items = await listPendingInvoiceItems({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: id,
  });

  return NextResponse.json({ items });
}, ['admin']);

export const POST = withAuth(async (request: NextRequest, _user, { params }: RouteParams) => {
  const body = await request.json();
  const parsed = invoiceItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
  }

  const { id } = await params;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const item = await createPendingInvoiceItem({
    supabaseAdmin,
    stripeClient: stripe,
    profileId: id,
    input: {
      description: parsed.data.description,
      amountSek: parsed.data.amount,
      currency: parsed.data.currency,
    },
  });

  return NextResponse.json({ item });
}, ['admin']);
