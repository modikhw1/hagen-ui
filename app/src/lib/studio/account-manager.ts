import type { SupabaseClient } from '@supabase/supabase-js';

interface AccountManagerAssignment {
  accountManager: string | null;
  accountManagerProfileId: string | null;
}

/**
 * Resolves an account manager name/email to a profile ID.
 *
 * Takes an optional account_manager string (which can be a name or email)
 * and resolves it to the corresponding profile ID from the profiles table.
 *
 * @param supabaseAdmin - Supabase admin client with service role
 * @param accountManager - Account manager name or email (optional)
 * @returns Object with resolved accountManager string and accountManagerProfileId
 */
export async function resolveAccountManagerAssignment(
  supabaseAdmin: SupabaseClient,
  accountManager: string | null | undefined
): Promise<AccountManagerAssignment> {
  if (!accountManager || typeof accountManager !== 'string') {
    return { accountManager: null, accountManagerProfileId: null };
  }

  const normalizedInput = accountManager.trim();

  // Try to find by email first
  const { data: profileByEmail, error: emailError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, business_name')
    .ilike('email', normalizedInput)
    .single();

  if (!emailError && profileByEmail) {
    return {
      accountManager: profileByEmail.business_name || profileByEmail.email,
      accountManagerProfileId: profileByEmail.id,
    };
  }

  // Try to find by business_name (case-insensitive)
  const { data: profileByName, error: nameError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, business_name')
    .ilike('business_name', normalizedInput)
    .single();

  if (!nameError && profileByName) {
    return {
      accountManager: profileByName.business_name,
      accountManagerProfileId: profileByName.id,
    };
  }

  // If no match found, return the input as-is with null profile ID
  // The caller may choose to handle this case specially
  return {
    accountManager: normalizedInput,
    accountManagerProfileId: null,
  };
}
