// app/src/hooks/useUrlState.ts

'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface UseUrlStateOptions {
  /** Anvand router.replace i stallet for router.push for att inte spamma history.
   *  Default: true. */
  replace?: boolean;
  /** Scrolla inte till toppen vid URL-uppdatering. Default: false (Next default). */
  scroll?: boolean;
}

type UrlStateSetter = (value: string | null) => void;
type UrlStateMapSetter = (
  keyOrMap: string | Record<string, string | null>,
  value?: string | null,
) => void;
type UrlStateMapApi = {
  get: (key: string) => string | null;
  set: UrlStateMapSetter;
};

/**
 * Generisk hook for att lasa eller skriva en enskild URL-search-param.
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
): [T, UrlStateSetter];

export function useUrlState(
  key: string,
  options?: UseUrlStateOptions,
): [string | null, UrlStateSetter];

export function useUrlState(): UrlStateMapApi;

export function useUrlState(
  keyOrOptions?: string | UseUrlStateOptions,
  maybeOptions: UseUrlStateOptions & { defaultValue?: string } = {},
): [string | null, UrlStateSetter] | UrlStateMapApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safePathname = pathname ?? '';
  const isKeyedCall = typeof keyOrOptions === 'string';
  const replace = isKeyedCall ? (maybeOptions.replace ?? true) : true;
  const scroll = isKeyedCall ? (maybeOptions.scroll ?? false) : false;
  const key = isKeyedCall ? keyOrOptions : '';
  const defaultValue = isKeyedCall ? maybeOptions.defaultValue : undefined;

  const applyParams = useCallback(
    (params: URLSearchParams) => {
      const nextQuery = params.toString();
      const url = nextQuery ? `${safePathname}?${nextQuery}` : safePathname;

      if (replace) {
        router.replace(url, { scroll });
      } else {
        router.push(url, { scroll });
      }
    },
    [replace, router, safePathname, scroll],
  );

  const setValue = useCallback<UrlStateSetter>(
    (newValue) => {
      if (!isKeyedCall) {
        return;
      }

      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (newValue === null || newValue === '') {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }

      applyParams(params);
    },
    [applyParams, isKeyedCall, key, searchParams],
  );

  if (!isKeyedCall) {
    const get = (searchKey: string) => searchParams?.get(searchKey) ?? null;
    const set: UrlStateMapSetter = (keyOrMap, value) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (typeof keyOrMap === 'string') {
        if (value === null || value === '' || value === undefined) {
          params.delete(keyOrMap);
        } else {
          params.set(keyOrMap, value);
        }
      } else {
        Object.entries(keyOrMap).forEach(([entryKey, entryValue]) => {
          if (entryValue === null || entryValue === '' || entryValue === undefined) {
            params.delete(entryKey);
          } else {
            params.set(entryKey, entryValue);
          }
        });
      }

      applyParams(params);
    };

    return { get, set };
  }

  const value = searchParams?.get(key) ?? defaultValue ?? null;
  return [value, setValue];
}
