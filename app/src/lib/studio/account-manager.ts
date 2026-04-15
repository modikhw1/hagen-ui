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

  // 1. Try team_members first (authoritative source for CM/account manager roles)
  const { data: teamMember, error: tmError } = await supabaseAdmin
    .from('team_members')
    .select('profile_id, name, email')
    .or(`name.ilike.${normalizedInput},email.ilike.${normalizedInput}`)
    .maybeSingle();

  if (!tmError && teamMember?.profile_id) {
    return {
      accountManager: teamMember.name || teamMember.email || normalizedInput,
      accountManagerProfileId: teamMember.profile_id as string,
    };
  }

  // 2. Fall back to profiles by email
  const { data: profileByEmail } = await supabaseAdmin
    .from('profiles')
    .select('id, email, business_name')
    .ilike('email', normalizedInput)
    .maybeSingle();

  if (profileByEmail) {
    return {
      accountManager: profileByEmail.business_name || profileByEmail.email,
      accountManagerProfileId: profileByEmail.id,
    };
  }

  // 3. Fall back to profiles by business_name
  const { data: profileByName } = await supabaseAdmin
    .from('profiles')
    .select('id, email, business_name')
    .ilike('business_name', normalizedInput)
    .maybeSingle();

  if (profileByName) {
    return {
      accountManager: profileByName.business_name,
      accountManagerProfileId: profileByName.id,
    };
  }

  // No match found — return the input as-is with null profile ID
  return {
    accountManager: normalizedInput,
    accountManagerProfileId: null,
  };
}
