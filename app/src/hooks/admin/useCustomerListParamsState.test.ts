import { describe, expect, it } from 'vitest';
import {
  buildCustomerListUrl,
  LIST_SEARCH_DEBOUNCE_MS,
  reduceCustomerListParams,
} from '@/hooks/admin/useCustomerListParamsState';

describe('useCustomerListParamsState helpers', () => {
  it('merges sequential actions against the latest state', () => {
    const afterFilter = reduceCustomerListParams(
      {
        search: 'acme',
        filter: 'all',
        sort: 'newest',
        page: 4,
      },
      {
        type: 'filter',
        value: 'active',
      },
    );

    const afterSort = reduceCustomerListParams(afterFilter, {
      type: 'sort',
      value: 'oldest',
    });

    expect(afterSort).toEqual({
      search: 'acme',
      filter: 'active',
      sort: 'oldest',
      page: 1,
    });
  });

  it('serializes only non-default values into list urls', () => {
    expect(
      buildCustomerListUrl('/admin/customers', {
        search: 'acme',
        filter: 'active',
        sort: 'oldest',
        page: 3,
      }),
    ).toBe('/admin/customers?q=acme&filter=active&sort=oldest&page=3');

    expect(
      buildCustomerListUrl('/admin/customers', {
        search: '',
        filter: 'all',
        sort: 'newest',
        page: 1,
      }),
    ).toBe('/admin/customers');
  });

  it('keeps the intended debounce window explicit', () => {
    expect(LIST_SEARCH_DEBOUNCE_MS).toBe(300);
  });
});
