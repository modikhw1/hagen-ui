async function apiFetch<T>(url: string, body: unknown): Promise<{ success: boolean } & Partial<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.message || 'Serverfel' } as never;
    return { success: true, ...json };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Nätverksfel' } as never;
  }
}

export async function prepareDemoStudioAction(demoId: string) {
  return apiFetch<{ customerId: string }>('/api/admin/demos/' + demoId + '/convert', { demoId });
}
