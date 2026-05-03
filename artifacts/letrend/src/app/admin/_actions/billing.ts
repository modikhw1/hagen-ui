import type { BillingDiscountInput } from '@/lib/schemas/billing';

type AdminActionError = { error: { code: string; message: string } };
type AdminActionSuccess<T> = { data: T };
export type AdminActionResult<T> = AdminActionError | AdminActionSuccess<T>;

async function apiFetch<T>(url: string, body: unknown): Promise<AdminActionResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { error: { code: 'SERVER_ERROR', message: json.message || 'Serverfel' } };
    return { data: json };
  } catch (e) {
    return { error: { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : 'Nätverksfel' } };
  }
}

export async function previewSubscriptionPrice(input: {
  customerId: string;
  monthlyPriceSek: number;
  mode: 'now' | 'next_period';
}) {
  return apiFetch(`/api/admin/customers/${input.customerId}/subscription-preview`, input);
}

export async function changeSubscriptionPrice(input: {
  customerId: string;
  monthlyPriceSek: number;
  mode: 'now' | 'next_period';
}) {
  return apiFetch(`/api/admin/customers/${input.customerId}/subscription-price`, input);
}

export async function resendInvite(input: { customerId: string }) {
  return apiFetch(`/api/admin/customers/${input.customerId}/invite`, input);
}

export async function inviteCustomer(input: unknown): Promise<AdminActionResult<{
  customerId: string;
  inviteSent: boolean;
  profileUrl: string;
  warnings: string[];
}>> {
  return apiFetch('/api/admin/customers/create', input);
}

export async function applyDiscount(input: {
  customerId: string;
  payload: BillingDiscountInput;
}) {
  return apiFetch(`/api/admin/customers/${input.customerId}/discount`, input.payload);
}

export async function removeDiscount(input: { customerId: string }) {
  return apiFetch(`/api/admin/customers/${input.customerId}/discount`, { _method: 'DELETE' });
}
