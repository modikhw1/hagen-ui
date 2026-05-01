// app/src/hooks/useUrlState.ts

'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface UseUrlStateOptions {
  /** Använd router.replace istället för router.push för att inte spamma history.
   *  Default: true. */
  replace?: boolean;
  /** Scrolla inte till toppen vid URL-uppdatering. Default: false (Next default). */
  scroll?: boolean;
}

/**
 * Generisk hook för att läsa/skriva en enskild URL-search-param.
 * Stödjer även parameterlöst anrop för bakåtkompatibilitet.
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
): any {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hantera parameterlöst anrop: useUrlState()
  if (keyOrOptions === undefined || typeof keyOrOptions !== 'string') {
    const get = (k: string) => searchParams?.get(k) ?? null;
    const set = (kOrMap: string | Record<string, string | null>, v?: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      
      if (typeof kOrMap === 'string') {
        if (v === null || v === '' || v === undefined) {
          params.delete(kOrMap);
        } else {
          params.set(kOrMap, v);
        }
      } else {
        Object.entries(kOrMap).forEach(([k, val]) => {
          if (val === null || val === '' || val === undefined) {
            params.delete(k);
          } else {
            params.set(k, val);
          }
        });
      }

      const url = `${pathname}?${params.toString()}`;
      router.replace(url, { scroll: false });
    };
    return { get, set };
  }

  const key = keyOrOptions;
  const options = maybeOptions;
  const { replace = true, scroll = false, defaultValue } = options;
  const value = searchParams?.get(key) ?? defaultValue ?? null;

  const setValue = useCallback(
    (newValue: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (newValue === null || newValue === '') {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      const url = `${pathname}?${params.toString()}`;
      if (replace) {
        router.replace(url, { scroll });
      } else {
        router.push(url, { scroll });
      }
    },
    [router, pathname, searchParams, key, replace, scroll],
  );

  return [value, setValue];
}
