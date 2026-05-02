// lib/studio/urls.ts

export function studioUrlForCustomer(c: { id: string; status: string }): string | null {
  // Studio är inte tillgängligt för pre-onboarding statusar.
  if (['archived', 'invited'].includes(c.status)) return null;
  // Denna route kan behöva justeras när Studio-strukturen är klar
  return `/studio/customers/${c.id}`; 
}
