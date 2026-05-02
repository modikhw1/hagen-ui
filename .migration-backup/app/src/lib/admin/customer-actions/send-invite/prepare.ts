import 'server-only';

import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { normalizeTikTokProfileIdentityInput } from '@/lib/tiktok/customer-profile-link';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import type { AdminActionContext } from '../types';
import type { PreparedInvite, SendInviteInput, SendInviteStepResult } from './types';

export async function prepareSendInvite(
  ctx: AdminActionContext,
  input: SendInviteInput,
): Promise<SendInviteStepResult<PreparedInvite>> {
  const assignment = await resolveAccountManagerAssignment(
    ctx.supabaseAdmin,
    input.account_manager,
  );

  const tiktokIdentity = normalizeTikTokProfileIdentityInput(input.tiktok_profile_url ?? null);
  if (!tiktokIdentity.ok) {
    return {
      ok: false,
      error: SERVER_COPY.invalidTikTok,
      statusCode: 400,
    };
  }

  const attemptNonce = Number(ctx.beforeProfile?.invite_attempt_nonce ?? 0) + 1;
  const { error: nonceError } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .update({ invite_attempt_nonce: attemptNonce })
    .eq('id', ctx.id);
  if (nonceError) {
    return {
      ok: false,
      error: nonceError.message,
      statusCode: 500,
    };
  }

  return {
    ok: true,
    value: {
      attemptNonce,
      canonicalTikTokProfileUrl: tiktokIdentity.value.tiktok_profile_url,
      tiktokHandle: tiktokIdentity.value.tiktok_handle,
      assignment: {
        accountManager: assignment.accountManager,
        accountManagerProfileId: assignment.accountManagerProfileId,
      },
    },
  };
}
