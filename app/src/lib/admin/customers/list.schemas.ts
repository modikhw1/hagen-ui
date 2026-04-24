import { z } from 'zod';
import type { CustomerListParams } from '@/lib/admin/customers/list.types';

const customerListFilterSchema = z.enum(['all', 'active', 'pipeline', 'archived']);
const customerListSortSchema = z.enum(['newest', 'oldest', 'needs_action', 'alphabetical']);

function firstValue(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

export const customerListParamsInputSchema = z
  .object({
    q: z.union([z.string(), z.array(z.string())]).optional(),
    filter: customerListFilterSchema.optional(),
    sort: customerListSortSchema.optional(),
    page: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .transform<CustomerListParams>((input) => ({
    search: firstValue(input.q)?.trim() ?? '',
    filter: input.filter ?? 'all',
    sort: input.sort ?? 'newest',
    page: input.page ?? 1,
  }));
