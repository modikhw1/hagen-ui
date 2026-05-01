// app/src/hooks/useUrlState.ts

'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface UseUrlStateOptions {
  /** Anvand router.replace istallet for router.push for att inte spamma history.
   *  Default: true. */
  replace?: boolean;
  /** Scrolla inte till toppen vid URL-uppdatering. Default: false (Next default). */
  scroll?: boolean;
}

/**
 * Generisk hook for att lasa/skriva en enskild URL-search-param.
 * Stodjer aven parameterlost anrop for bakatkompatibilitet.
 *
 * @example
 *   const [view, setView] = useUrlState('view', { defaultValue: 'grid' });
 *   // eller gammalt format:
 *   const { get, set } = useUrlState();
 */
export function useUrlState<T extends string = string>(
  key: string,
  options: { defaultValue: T } & UseUrlStateOptions,
): [T, (value: T | null) => void];

export function useUrlState(
  key: string,
  options?: UseUrlStateOptions,
): [string | null, (value: string | null) => void];

export function useUrlState(): {
  get: (key: string) => string | null;
  set: (keyOrMap: string | Record<string, string | null>, value?: string | null) => void;
};

export function useUrlState(
  keyOrOptions?: string | UseUrlStateOptions,
  maybeOptions: UseUrlStateOptions & { defaultValue?: string } = {},
):
  | [string | null, (value: string | null) => void]
  | {
      get: (key: string) => string | null;
      set: (keyOrMap: string | Record<string, string | null>, value?: string | null) => void;
    } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = typeof keyOrOptions === 'string' ? keyOrOptions : null;
  const { replace = true, scroll = false, defaultValue } = maybeOptions;

  const setParams = useCallback(
    (keyOrMap: string | Record<string, string | null>, value?: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (typeof keyOrMap === 'string') {
        if (value === null || value === '' || value === undefined) {
          params.delete(keyOrMap);
        } else {
          params.set(keyOrMap, value);
        }
      } else {
        Object.entries(keyOrMap).forEach(([paramKey, paramValue]) => {
          if (paramValue === null || paramValue === '' || paramValue === undefined) {
            params.delete(paramKey);
          } else {
            params.set(paramKey, paramValue);
          }
        });
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setValue = useCallback(
    (newValue: string | null) => {
      if (!key) {
        return;
      }

      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (newValue === null || newValue === '') {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (replace) {
        router.replace(url, { scroll });
      } else {
        router.push(url, { scroll });
      }
    },
    [key, pathname, replace, router, scroll, searchParams],
  );

  if (!key) {
    return {
      get: (searchKey: string) => searchParams?.get(searchKey) ?? null,
      set: setParams,
    };
  }

  const value = searchParams?.get(key) ?? defaultValue ?? null;
  return [value, setValue];
}
