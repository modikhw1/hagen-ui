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
    public readonly code?: string,
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

type ErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  field?: string;
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

function createRequestId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isUrlSearchParams(value: unknown): value is URLSearchParams {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    isFormData(value) ||
    isUrlSearchParams(value) ||
    isBlob(value) ||
    isArrayBuffer(value)
  );
}

async function parsePayload(response: Response) {
  if (response.status === 204) {
    return {};
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  if (!text) {
    return {};
  }

  return { error: text };
}

function resolveMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybePayload = payload as ErrorPayload;
  if (typeof maybePayload.error === 'string' && maybePayload.error.trim()) {
    return maybePayload.error;
  }
  if (typeof maybePayload.message === 'string' && maybePayload.message.trim()) {
    return maybePayload.message;
  }

  return fallback;
}

function resolveField(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const maybePayload = payload as ErrorPayload;
  return typeof maybePayload.field === 'string' ? maybePayload.field : undefined;
}

function resolveCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const maybePayload = payload as ErrorPayload;
  return typeof maybePayload.code === 'string' ? maybePayload.code : undefined;
}

async function requestJson<T>(path: string, options: RequestOptions): Promise<T> {
  const requestId = createRequestId();
  const headers = new Headers({
    Accept: 'application/json',
    'x-request-id': requestId,
    ...options.headers,
  });

  let body: BodyInit | undefined;
  if (options.method !== 'GET' && options.body !== undefined) {
    if (isBodyInit(options.body)) {
      body = options.body;
      if (isFormData(options.body)) {
        headers.delete('Content-Type');
      }
    } else {
      headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method,
    credentials: 'include',
    signal: options.signal,
    headers,
    body,
  });

  const payload = await parsePayload(response);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    throw new ApiError(
      429,
      resolveMessage(payload, 'För många förfrågningar'),
      'rate_limited',
      undefined,
      {
        ...(payload && typeof payload === 'object' ? payload : {}),
        requestId,
        retryAfter,
      },
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      resolveMessage(payload, 'Kunde inte kontakta servern'),
      resolveCode(payload),
      resolveField(payload),
      {
        ...(payload && typeof payload === 'object' ? payload : {}),
        requestId,
      },
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
  del<T>(path: string, opts?: ApiOptions) {
    return requestJson<T>(path, { ...opts, method: 'DELETE' });
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

type CustomerActionRequest = {
  path: string;
  method: 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
};

function withoutAction(payload: CustomerAction) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'action'),
  );
}

function resolveCustomerActionRequest(
  id: string,
  payload: CustomerAction,
): CustomerActionRequest {
  switch (payload.action) {
    case 'send_invite':
      return {
        path: `/api/admin/customers/${id}/invite`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'resend_invite':
      return { path: `/api/admin/customers/${id}/invite`, method: 'POST', body: {} };
    case 'activate':
      return { path: `/api/admin/customers/${id}/activate`, method: 'POST', body: {} };
    case 'send_reminder':
      return { path: `/api/admin/customers/${id}/reminder`, method: 'POST', body: {} };
    case 'reactivate_archive':
      return { path: `/api/admin/customers/${id}/reactivate`, method: 'POST', body: {} };
    case 'set_temporary_coverage':
      return {
        path: `/api/admin/customers/${id}/actions/set_temporary_coverage`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'cancel_subscription':
      return {
        path: `/api/admin/customers/${id}/cancel`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'pause_subscription':
      return {
        path: `/api/admin/customers/${id}/pause`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'resume_subscription':
      return { path: `/api/admin/customers/${id}/resume`, method: 'POST', body: {} };
    case 'change_subscription_price':
      return {
        path: `/api/admin/customers/${id}/subscription-price`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'change_account_manager':
      return {
        path: `/api/admin/customers/${id}/actions/change_account_manager`,
        method: 'POST',
        body: withoutAction(payload),
      };
    case 'update_profile':
      return {
        path: `/api/admin/customers/${id}`,
        method: 'PATCH',
        body: withoutAction(payload),
      };
  }
}

function toActionError(error: unknown, fallback: string): CustomerActionResult {
  if (error instanceof ApiError) {
    const parsedError = customerActionErrorSchema.safeParse(error.raw);
    if (parsedError.success) {
      return {
        ok: false,
        error: parsedError.data.error,
        status: error.status,
        details: parsedError.data.details,
      };
    }

    return {
      ok: false,
      error: error.message,
      status: error.status,
      details: error.raw,
    };
  }

  return {
    ok: false,
    error: fallback,
    status: 500,
  };
}

export async function callCustomerAction(
  id: string,
  payload: CustomerAction,
): Promise<CustomerActionResult> {
  const parsedPayload = customerActionSchema.parse(payload);
  const request = resolveCustomerActionRequest(id, parsedPayload);

  try {
    const response =
      request.method === 'DELETE'
        ? await apiClient.del(request.path)
        : request.method === 'PATCH'
          ? await apiClient.patch(request.path, request.body ?? {})
          : await apiClient.post(request.path, request.body ?? {});

    const parsedResult = customerActionResultSchema.safeParse(response);
    if (!parsedResult.success) {
      return {
        ok: false,
        error: 'Ogiltigt svar från servern',
        status: 500,
        details: parsedResult.error.issues,
      };
    }

    if (
      'success' in parsedResult.data &&
      parsedResult.data.success === false &&
      typeof parsedResult.data.error === 'string'
    ) {
      return {
        ok: false,
        error: parsedResult.data.error,
        status:
          typeof parsedResult.data.statusCode === 'number'
            ? parsedResult.data.statusCode
            : 400,
        details: parsedResult.data.details,
      };
    }

    if (
      'success' in parsedResult.data &&
      parsedResult.data.success === true &&
      'data' in parsedResult.data
    ) {
      return {
        ok: true,
        success: true,
        data: parsedResult.data.data,
        ...('meta' in parsedResult.data && parsedResult.data.meta
          ? { meta: parsedResult.data.meta }
          : {}),
      };
    }

    if ('error' in parsedResult.data && typeof parsedResult.data.error === 'string') {
      return {
        ok: false,
        error: parsedResult.data.error,
        status: 400,
        details: parsedResult.data.details,
      };
    }

    return {
      ok: true,
      success: true,
      data: parsedResult.data,
    };
  } catch (error) {
    return toActionError(error, 'Misslyckades att uppdatera kunden');
  }
}

export async function archiveCustomer(id: string): Promise<CustomerActionResult> {
  try {
    const response = await apiClient.del(`/api/admin/customers/${id}/archive`);
    const parsedResult = customerActionResultSchema.safeParse(response);

    if (!parsedResult.success) {
      return {
        ok: false,
        error: 'Ogiltigt svar från servern',
        status: 500,
        details: parsedResult.error.issues,
      };
    }

    if (
      'success' in parsedResult.data &&
      parsedResult.data.success === false &&
      typeof parsedResult.data.error === 'string'
    ) {
      return {
        ok: false,
        error: parsedResult.data.error,
        status:
          typeof parsedResult.data.statusCode === 'number'
            ? parsedResult.data.statusCode
            : 400,
        details: parsedResult.data.details,
      };
    }

    if (
      'success' in parsedResult.data &&
      parsedResult.data.success === true &&
      'data' in parsedResult.data
    ) {
      return {
        ok: true,
        success: true,
        data: parsedResult.data.data,
        ...('meta' in parsedResult.data && parsedResult.data.meta
          ? { meta: parsedResult.data.meta }
          : {}),
      };
    }

    if ('error' in parsedResult.data && typeof parsedResult.data.error === 'string') {
      return {
        ok: false,
        error: parsedResult.data.error,
        status: 400,
        details: parsedResult.data.details,
      };
    }

    return {
      ok: true,
      success: true,
      data: parsedResult.data,
    };
  } catch (error) {
    return toActionError(error, 'Misslyckades att arkivera kunden');
  }
}
