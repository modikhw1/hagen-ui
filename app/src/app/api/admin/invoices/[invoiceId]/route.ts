import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { payInvoice, voidInvoice } from '@/lib/stripe/admin-billing';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const invoiceActionSchema = z
  .object({
    action: z.enum(['pay', 'void']),
  })
  .strict();

export const PATCH = withAuth(
  async (
    request: NextRequest,
    _user,
    { params }: { params: Promise<{ invoiceId: string }> }
  ) => {
    const { invoiceId } = await params;
    const parsed = invoiceActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (parsed.data.action === 'pay') {
      const invoice = await payInvoice({
        supabaseAdmin,
        stripeClient: stripe,
        invoiceId,
      });

      return NextResponse.json({ invoice });
    }

    const invoice = await voidInvoice({
      supabaseAdmin,
      stripeClient: stripe,
      invoiceId,
    });

    return NextResponse.json({ invoice });
  },
  ['admin']
);
