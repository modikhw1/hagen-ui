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
        sort: 'recent',
        page: 4,
      },
      {
        type: 'SET_FILTER',
        value: 'active',
      },
    );

    const afterSort = reduceCustomerListParams(afterFilter, {
      type: 'SET_SORT',
      value: 'name_asc',
    });

    expect(afterSort).toEqual({
      search: 'acme',
      filter: 'active',
      sort: 'name_asc',
      page: 1,
    });
  });

  it('serializes only non-default values into list urls', () => {
    expect(
      buildCustomerListUrl({
        search: 'acme',
        filter: 'active',
        sort: 'name_asc',
        page: 3,
      }, '/admin/customers'),
    ).toBe('/admin/customers?q=acme&filter=active&sort=name_asc&page=3');

    expect(
      buildCustomerListUrl({
        search: '',
        filter: 'all',
        sort: 'recent',
        page: 1,
      }, '/admin/customers'),
    ).toBe('/admin/customers');
  });

  it('keeps the intended debounce window explicit', () => {
    expect(LIST_SEARCH_DEBOUNCE_MS).toBe(300);
  });
});
