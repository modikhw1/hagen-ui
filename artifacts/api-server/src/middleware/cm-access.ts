import type { Request, Response } from 'express';
import { createSupabaseAdmin } from '../lib/supabase.js';

/**
 * Enforce that the current user can act on the given customer.
 *
 * - Admins (req.user.is_admin === true OR req.user.role === 'admin') bypass the
 *   check and always succeed.
 * - Other authenticated users (content_manager) must own the customer via
 *   customer_profiles.account_manager_profile_id === req.user.id.
 *
 * On failure this writes a 400/401/403/500 JSON response and returns false.
 * The caller MUST `return` immediately when this returns false.
 */
export async function ensureCustomerAccess(
  req: Request,
  res: Response,
  customerIdInput: string | string[] | undefined,
): Promise<boolean> {
  const customerId = typeof customerIdInput === 'string' ? customerIdInput : '';
  if (!customerId) {
    res.status(400).json({ error: 'customer_id is required' });
    return false;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Inte autentiserad' });
    return false;
  }
  if (req.user.is_admin || req.user.role === 'admin') return true;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id, account_manager_profile_id')
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return false;
  }
  if (
    !data
    || (data as { account_manager_profile_id: string | null }).account_manager_profile_id !== req.user.id
  ) {
    res.status(403).json({ error: 'Du har inte åtkomst till denna kund.' });
    return false;
  }
  return true;
}
