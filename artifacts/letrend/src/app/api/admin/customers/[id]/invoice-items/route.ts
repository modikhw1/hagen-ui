import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditLog } from '@/lib/admin/audit-log';
import { revalidateAdminCustomerViews } from '@/lib/admin/cache-tags';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import {
  createStripeClient,
  stripe,
  stripeEnvironment,
} from '@/lib/stripe/dynamic-config';
import {
  createPendingInvoiceItem,
  listPendingInvoiceItems,
} from '@/lib/stripe/admin-billing';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    amount: z.number().min(0).optional(),
    unit_amount: z.number().min(0).optional(),
    quantity: z.number().int().min(1).default(1),
    currency: z.string().trim().min(3).max(3).default('sek'),
    internal_note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((value) => value.unit_amount != null || value.amount != null, {
    message: 'Belopp saknas',
    path: ['unit_amount'],
  })
  .strict();

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isMissingStripeCustomer(error: unknown) {
  return error instanceof Error && error.message.includes('No such customer');
}

async function findCustomerInOtherStripeEnvironment(customerId: string) {
  const otherEnvironment = stripeEnvironment === 'live' ? 'test' : 'live';
  const otherStripe = createStripeClient(otherEnvironment);
  if (!otherStripe || !customerId) return null;

  try {
    const customer = await otherStripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) return null;
    return otherEnvironment;
  } catch {
    return null;
  }
}

export const GET = withAuth(
  async (_request: NextRequest, _user, { params }: RouteParams) => {
    const { id } = await params;
    const supabaseAdmin = createSupabaseAdmin();

    try {
      const items = await listPendingInvoiceItems({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return NextResponse.json({ items });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel';

      if (isMissingStripeCustomer(error)) {
        const missingCustomerId = message.match(/'([^']+)'/)?.[1] ?? '';
        const otherEnvironment = await findCustomerInOtherStripeEnvironment(
          missingCustomerId,
        );

        return NextResponse.json({
          items: [],
          warning: {
            type: 'missing_stripe_customer',
            message: otherEnvironment
              ? `Kundens Stripe-koppling finns i Stripe ${otherEnvironment}, men aktiv miljö är ${stripeEnvironment}.`
              : 'Kundens Stripe-koppling finns i databasen men kunden saknas i aktiv Stripe-miljö.',
            details: message,
          },
        });
      }

      console.error('[pending invoice items] GET failed', {
        customerId: id,
        message,
      });

      return NextResponse.json(
        {
          error: 'Kunde inte hämta väntande fakturaposter',
          details: message,
        },
        { status: 502 },
      );
    }
  },
  ['admin'],
);

export const POST = withAuth(
  async (request: NextRequest, user, { params }: RouteParams) => {
    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan skapa väntande fakturaposter',
    );

    const body = await request.json();
    const parsed = invoiceItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ogiltig payload' }, { status: 400 });
    }

    const { id } = await params;
    const supabaseAdmin = createSupabaseAdmin();

    try {
      const item = await createPendingInvoiceItem({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        input: {
          description: parsed.data.description,
          unitAmountSek: parsed.data.unit_amount ?? parsed.data.amount ?? 0,
          quantity: parsed.data.quantity,
          currency: parsed.data.currency,
          metadata: parsed.data.internal_note
            ? { internal_note: parsed.data.internal_note }
            : undefined,
        },
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.invoice_item.created',
        entityType: 'customer_profile',
        entityId: id,
        metadata: {
          item_id: item.id,
          description: parsed.data.description,
          unit_amount: parsed.data.unit_amount ?? parsed.data.amount ?? 0,
          quantity: parsed.data.quantity,
          currency: parsed.data.currency,
          internal_note: parsed.data.internal_note,
        },
      });

      revalidateAdminCustomerViews(id);

      return NextResponse.json({ item });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel';
      console.error('[pending invoice items] POST failed', {
        customerId: id,
        message,
      });

      return NextResponse.json(
        {
          error: 'Kunde inte skapa väntande fakturapost',
          details: message,
        },
        { status: 502 },
      );
    }
  },
  ['admin'],
);
