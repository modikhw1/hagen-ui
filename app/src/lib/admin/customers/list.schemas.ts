import { z } from 'zod';
import type { CustomerListParams } from '@/lib/admin/customers/list.types';

const customerListFilterSchema = z.enum([
  'all', 
  'active', 
  'pending', 
  'paused', 
  'archived', 
  'prospect'
]);

const customerListSortSchema = z.enum([
  'recent',
  'name_asc', 'name_desc',
  'cm_asc', 'cm_desc',
  'price_asc', 'price_desc',
  'status_asc', 'status_desc',
  'needs_action',
  'alphabetical'
]);

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
    sort: input.sort ?? 'recent',
    page: input.page ?? 1,
  }));
