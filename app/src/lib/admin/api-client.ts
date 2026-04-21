import {
  customerActionErrorSchema,
  customerActionResultSchema,
  customerActionSchema,
  type CustomerAction,
  type CustomerActionSuccessResult,
} from '@/lib/admin/schemas/customer-actions';

type QueryValue = string | number | boolean | null | undefined;

export type ApiOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, QueryValue>;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = ApiOptions & {
  body?: unknown;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
};

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  if (!query) return path;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  if (!queryString) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${queryString}`;
}

async function parseJson(response: Response) {
  return response.json().catch(() => ({}));
}

function resolveMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return fallback;
}

function resolveField(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'field' in payload &&
    typeof payload.field === 'string'
  ) {
    return payload.field;
  }

  return undefined;
}

async function requestJson<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
    ...options.headers,
  });

  if (options.method !== 'GET' && options.body !== undefined) {
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method,
    credentials: 'include',
    signal: options.signal,
    headers,
    body:
      options.method === 'GET' || options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      resolveMessage(payload, 'Kunde inte kontakta servern'),
      resolveField(payload),
      payload,
    );
  }

  return payload as T;
}

export const apiClient = {
  get<T>(path: string, opts?: ApiOptions) {
    return requestJson<T>(path, { ...opts, method: 'GET' });
  },
  post<T>(path: string, body: unknown, opts?: ApiOptions) {
    return requestJson<T>(path, { ...opts, body, method: 'POST' });
  },
  patch<T>(path: string, body: unknown, opts?: ApiOptions) {
    return requestJson<T>(path, { ...opts, body, method: 'PATCH' });
  },
  delete<T>(path: string, opts?: ApiOptions) {
    return requestJson<T>(path, { ...opts, method: 'DELETE' });
  },
};

export type CustomerActionResult =
  | ({ ok: true } & CustomerActionSuccessResult)
  | {
      ok: false;
      error: string;
      status: number;
      details?: unknown;
    };

async function parseActionResponse(response: Response): Promise<CustomerActionResult> {
  const payload = await parseJson(response);

  if (!response.ok) {
    const parsedError = customerActionErrorSchema.safeParse(payload);
    if (parsedError.success) {
      return {
        ok: false,
        error: parsedError.data.error,
        status: response.status,
        details: parsedError.data.details,
      };
    }

    return {
      ok: false,
      error: 'Misslyckades att uppdatera kunden',
      status: response.status,
    };
  }

  const parsedResult = customerActionResultSchema.safeParse(payload);
  if (!parsedResult.success) {
    return {
      ok: false,
      error: 'Ogiltigt svar fran servern',
      status: 500,
    };
  }

  if ('error' in parsedResult.data && typeof parsedResult.data.error === 'string') {
    return {
      ok: false,
      error: parsedResult.data.error,
      status: response.status || 500,
      details: parsedResult.data.details,
    };
  }

  return {
    ok: true,
    ...parsedResult.data,
  };
}

export async function callCustomerAction(
  id: string,
  payload: CustomerAction,
): Promise<CustomerActionResult> {
  const parsedPayload = customerActionSchema.parse(payload);
  const requestId = crypto.randomUUID();
  const response = await fetch(`/api/admin/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
    credentials: 'include',
    body: JSON.stringify(parsedPayload),
  });

  return parseActionResponse(response);
}

export async function archiveCustomer(id: string): Promise<CustomerActionResult> {
  const response = await fetch(`/api/admin/customers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  return parseActionResponse(response);
}
