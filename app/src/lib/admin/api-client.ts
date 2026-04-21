import {
  customerActionErrorSchema,
  customerActionResultSchema,
  customerActionSchema,
  type CustomerAction,
  type CustomerActionSuccessResult,
} from '@/lib/admin/schemas/customer-actions';

export type CustomerActionResult =
  | ({ ok: true } & CustomerActionSuccessResult)
  | {
      ok: false;
      error: string;
      status: number;
      details?: unknown;
    };

async function parseActionResponse(response: Response): Promise<CustomerActionResult> {
  const payload = await response.json().catch(() => ({}));

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
