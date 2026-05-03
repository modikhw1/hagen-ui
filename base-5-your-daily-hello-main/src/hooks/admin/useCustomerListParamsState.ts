// app/src/hooks/admin/useCustomerListParamsState.ts

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { 
  CustomerListParams, 
  CustomerListFilter, 
  CustomerListSort 
} from '@/lib/admin/customers/list.types';

export type { CustomerListParams } from '@/lib/admin/customers/list.types';

// ──────────────────────────────────────────────────────────────────────────────
// State shape
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_PARAMS: CustomerListParams = {
  search: '',
  filter: 'all',
  sort: 'recent',
  page: 1,
};

// ──────────────────────────────────────────────────────────────────────────────
// Reducer
// ──────────────────────────────────────────────────────────────────────────────

export type CustomerListAction =
  | { type: 'SET_SEARCH'; value: string }
  | { type: 'SET_FILTER'; value: CustomerListFilter }
  | { type: 'SET_SORT'; value: CustomerListSort }
  | { type: 'SET_PAGE'; value: number }
  | { type: 'RESET' }
  | { type: 'HYDRATE'; value: CustomerListParams };

export function reduceCustomerListParams(
  state: CustomerListParams,
  action: CustomerListAction,
): CustomerListParams {
  switch (action.type) {
    case 'SET_SEARCH':
      return { ...state, search: action.value, page: 1 };
    case 'SET_FILTER':
      return { ...state, filter: action.value, page: 1 };
    case 'SET_SORT':
      return { ...state, sort: action.value, page: 1 };
    case 'SET_PAGE':
      return { ...state, page: Math.max(1, action.value) };
    case 'RESET':
      return { ...DEFAULT_PARAMS };
    case 'HYDRATE':
      return action.value;
    default:
      return state;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// URL-serialisering
// ──────────────────────────────────────────────────────────────────────────────

export function buildCustomerListUrl(params: CustomerListParams, pathname: string): string {
  const sp = paramsToUrlSearchParams(params).toString();
  return sp ? `${pathname}?${sp}` : pathname;
}

function paramsToUrlSearchParams(p: CustomerListParams): URLSearchParams {
  const url = new URLSearchParams();
  if (p.search) url.set('q', p.search);
  if (p.filter !== 'all') url.set('filter', p.filter);
  if (p.sort !== 'recent') url.set('sort', p.sort);
  if (p.page !== 1) url.set('page', String(p.page));
  return url;
}

function urlSearchParamsToParams(sp: URLSearchParams): CustomerListParams {
  const filter = sp.get('filter') as CustomerListFilter | null;
  const sort = sp.get('sort') as CustomerListSort | null;
  const pageRaw = Number(sp.get('page') ?? '1');

  const validFilters: CustomerListFilter[] = ['all', 'active', 'pending', 'paused', 'archived', 'prospect'];
  const validSorts: CustomerListSort[] = [
    'recent', 'name_asc', 'name_desc', 'cm_asc', 'cm_desc', 
    'price_asc', 'price_desc', 'status_asc', 'status_desc', 
    'needs_action', 'alphabetical'
  ];

  return {
    search: sp.get('q') ?? '',
    filter:
      filter && validFilters.includes(filter)
        ? filter
        : 'all',
    sort:
      sort && validSorts.includes(sort)
        ? sort
        : 'recent',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export const LIST_SEARCH_DEBOUNCE_MS = 300;

export interface UseCustomerListParamsStateResult {
  params: CustomerListParams;
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** Flushar searchInput till params/URL omedelbart. */
  submitSearch: () => void;
  dispatch: (action: CustomerListAction) => void;
  isPending: boolean;
}

export function useCustomerListParamsState(): UseCustomerListParamsStateResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial state hydreras från URL.
  const initialParams = useMemo(
    () => urlSearchParamsToParams(new URLSearchParams(searchParams?.toString() ?? '')),
    // OBS: vi kör endast vid mount. Senare URL-ändringar hanteras av effect nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [params, dispatch] = useReducer(reduceCustomerListParams, initialParams);

  // Lokal state för sökrutan — gör typing smooth.
  const [searchInput, setSearchInput] = useState(initialParams.search);
  const [isPending, startTransition] = useTransition();

  // Debounce: när searchInput ändras, sätt timer som dispatchar SET_SEARCH.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      if (searchInput !== params.search) {
        startTransition(() => {
          dispatch({ type: 'SET_SEARCH', value: searchInput });
        });
      }
    }, LIST_SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Flusha searchInput direkt vid Enter eller submit.
  const submitSearch = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (searchInput !== params.search) {
      startTransition(() => {
        dispatch({ type: 'SET_SEARCH', value: searchInput });
      });
    }
  }, [searchInput, params.search]);

  // Sync params → URL (replace, inte push).
  // Vi använder en ref för att jämföra serialiserade strängar — detta undviker
  // race conditions där effekten kör innan reducer-staten flushats.
  const lastUrlRef = useRef<string>('');
  useEffect(() => {
    const newUrlSearch = paramsToUrlSearchParams(params).toString();
    if (newUrlSearch === lastUrlRef.current) return;
    lastUrlRef.current = newUrlSearch;
    const newUrl = buildCustomerListUrl(params, pathname || '/admin/customers');
    router.replace(newUrl, { scroll: false });
  }, [params, router, pathname]);

  // Sync URL → params (för back/forward-navigation).
  useEffect(() => {
    const fromUrl = urlSearchParamsToParams(
      new URLSearchParams(searchParams?.toString() ?? ''),
    );
    const fromUrlSerialized = paramsToUrlSearchParams(fromUrl).toString();
    const currentSerialized = paramsToUrlSearchParams(params).toString();
    if (fromUrlSerialized !== currentSerialized) {
      dispatch({ type: 'HYDRATE', value: fromUrl });
      setSearchInput(fromUrl.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const dispatchPublic = useCallback(
    (action: CustomerListAction) => {
      startTransition(() => {
        dispatch(action);
      });
    },
    [startTransition],
  );

  return {
    params,
    searchInput,
    setSearchInput,
    submitSearch,
    dispatch: dispatchPublic,
    isPending,
  };
}
