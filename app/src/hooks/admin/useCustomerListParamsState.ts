'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import type {
  CustomerListFilter,
  CustomerListParams,
  CustomerListSort,
} from '@/lib/admin/customers/list.types';

export const LIST_SEARCH_DEBOUNCE_MS = 300;

export type CustomerListParamsAction =
  | { type: 'search'; value: string }
  | { type: 'filter'; value: CustomerListFilter }
  | { type: 'sort'; value: CustomerListSort }
  | { type: 'page'; value: number };

export function reduceCustomerListParams(
  state: CustomerListParams,
  action: CustomerListParamsAction,
): CustomerListParams {
  switch (action.type) {
    case 'search':
      return { ...state, search: action.value, page: 1 };
    case 'filter':
      return { ...state, filter: action.value, page: 1 };
    case 'sort':
      return { ...state, sort: action.value, page: 1 };
    case 'page':
      return { ...state, page: action.value };
    default:
      return state;
  }
}

export function buildCustomerListUrl(pathname: string, state: CustomerListParams) {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function customerListStateToUrlUpdates(state: CustomerListParams) {
  return {
    q: state.search || null,
    filter: state.filter !== 'all' ? state.filter : null,
    sort: state.sort !== 'newest' ? state.sort : null,
    page: state.page > 1 ? state.page : null,
  };
}

export function useCustomerListParamsState(initial: CustomerListParams) {
  const { set } = useUrlState();
  const [params, setParams] = useState(initial);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [isPending, startTransition] = useTransition();
  const paramsRef = useRef(initial);

  const commit = useCallback(
    (next: CustomerListParams) => {
      paramsRef.current = next;
      setParams(next);
      startTransition(() => {
        set(customerListStateToUrlUpdates(next));
      });
    },
    [set],
  );

  const dispatch = useCallback(
    (action: CustomerListParamsAction) => {
      commit(reduceCustomerListParams(paramsRef.current, action));
    },
    [commit],
  );

  const submitSearch = useCallback(() => {
    if (searchInput === paramsRef.current.search) return;
    commit(reduceCustomerListParams(paramsRef.current, { type: 'search', value: searchInput }));
  }, [commit, searchInput]);

  useEffect(() => {
    if (searchInput === paramsRef.current.search) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (searchInput === paramsRef.current.search) {
        return;
      }

      commit(
        reduceCustomerListParams(paramsRef.current, {
          type: 'search',
          value: searchInput,
        }),
      );
    }, LIST_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [commit, searchInput]);

  return {
    params,
    searchInput,
    setSearchInput,
    isPending,
    dispatch,
    submitSearch,
  };
}
