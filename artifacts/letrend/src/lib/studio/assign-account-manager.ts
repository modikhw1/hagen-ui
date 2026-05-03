import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';

export interface AssignAccountManagerResult {
  success: boolean;
  updatedCustomerIds: string[];
  errors: Array<{ customerId: string; message: string }>;
}

/**
 * Atomically assigns an account manager to one or more customer profiles.
 *
 * Resolves the account manager's profile_id from the team_members table
 * (by matching on name) and then updates BOTH:
 *   - customer_profiles.account_manager  (display name)
 *   - customer_profiles.account_manager_profile_id  (UUID)
 *
 * This ensures both fields are always in sync.
 *
 * @param supabaseAdmin - Supabase admin client with service role
 * @param customerIds   - Array of customer_profile IDs to update
 * @param managerName   - The account manager's display name (as stored in team_members)
 * @returns Result summary with success status and any per-customer errors
 */
export async function assignAccountManager(
  supabaseAdmin: SupabaseClient,
  customerIds: string[],
  managerName: string | null
): Promise<AssignAccountManagerResult> {
  const updatedCustomerIds: string[] = [];
  const errors: Array<{ customerId: string; message: string }> = [];

  if (!customerIds.length) {
    return { success: true, updatedCustomerIds, errors };
  }

  const assignment = await resolveAccountManagerAssignment(supabaseAdmin, managerName);

  // Update all customer profiles in a single query for efficiency
  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .update({
      account_manager: assignment.accountManager,
      account_manager_profile_id: assignment.accountManagerProfileId,
    })
    .in('id', customerIds)
    .select('id');

  if (error) {
    // Record individual errors for all customer IDs
    for (const customerId of customerIds) {
      errors.push({ customerId, message: error.message });
    }
    return { success: false, updatedCustomerIds, errors };
  }

  for (const row of data ?? []) {
    updatedCustomerIds.push(row.id as string);
  }

  return {
    success: errors.length === 0,
    updatedCustomerIds,
    errors,
  };
}
