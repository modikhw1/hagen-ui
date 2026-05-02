import 'server-only';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';

type SearchValue = string | number | boolean | null | undefined;

function appendSearchParams(url: URL, search?: Record<string, SearchValue>) {
  if (!search) {
    return;
  }

  for (const [key, value] of Object.entries(search)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function buildAdminUrl(pathname: string, search?: Record<string, SearchValue>) {
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');

  if (!host) {
    throw new Error('Kunde inte bygga intern admin-URL.');
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const url = new URL(pathname, `${protocol}://${host}`);
  appendSearchParams(url, search);
  return url;
}

export async function fetchAdminRoute<TSchema extends z.ZodTypeAny>(
  pathname: string,
  schema: TSchema,
  search?: Record<string, SearchValue>,
): Promise<z.infer<TSchema>> {
  const url = await buildAdminUrl(pathname, search);
  const cookieStore = await cookies();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `Kunde inte h\u00e4mta ${pathname}`;
    throw new Error(message);
  }

  return schema.parse(payload);
}
