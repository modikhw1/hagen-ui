import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  billingInvoiceStatuses,
  billingSubscriptionStatuses,
} from '@/lib/admin/billing';

const invoiceListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    page: z.coerce.number().int().min(1).optional(),
    customerProfileId: z.string().uuid().optional(),
    customer_profile_id: z.string().uuid().optional(),
    status: z.enum(billingInvoiceStatuses).optional(),
    q: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
    environment: z.enum(['test', 'live']).optional(),
    includeLineItems: z.coerce.boolean().optional(),
  })
  .strict();

const subscriptionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    page: z.coerce.number().int().min(1).optional(),
    status: z.enum(billingSubscriptionStatuses).optional(),
    q: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
    environment: z.enum(['test', 'live']).optional(),
    customer_profile_id: z.string().uuid().optional(),
    stripe_subscription_id: z.string().trim().min(1).optional(),
  })
  .strict();

export function parseInvoiceListQuery(request: NextRequest) {
  return invoiceListQuerySchema.safeParse(
    readSearchParams(request, [
      'limit',
      'page',
      'customerProfileId',
      'customer_profile_id',
      'status',
      'q',
      'from',
      'to',
      'environment',
      'includeLineItems',
    ]),
  );
}

export function parseSubscriptionListQuery(request: NextRequest) {
  return subscriptionListQuerySchema.safeParse(
    readSearchParams(request, [
      'limit',
      'page',
      'status',
      'q',
      'from',
      'to',
      'environment',
      'customer_profile_id',
      'stripe_subscription_id',
    ]),
  );
}

function readSearchParams(request: NextRequest, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => [key, request.nextUrl.searchParams.get(key) ?? undefined]),
  );
}
