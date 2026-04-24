'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UrlStateValue = string | number | boolean | null | undefined;

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();

  const set = useCallback(
    (updates: Record<string, UrlStateValue>) => {
      const next = new URLSearchParams(params?.toString() ?? '');
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === undefined) {
          next.delete(key);
          continue;
        }

        next.set(key, String(value));
      }

      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  const get = useCallback(
    <T extends string = string>(key: string): T | null =>
      (params?.get(key) as T | null) ?? null,
    [params],
  );

  return { get, set, params };
}
