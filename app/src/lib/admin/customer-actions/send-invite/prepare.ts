import 'server-only';

import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { deriveTikTokHandle, toCanonicalTikTokProfileUrl } from '@/lib/tiktok/profile';
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

  const canonicalTikTokProfileUrl = input.tiktok_profile_url
    ? toCanonicalTikTokProfileUrl(input.tiktok_profile_url)
    : null;
  const tiktokHandle = input.tiktok_profile_url
    ? deriveTikTokHandle(input.tiktok_profile_url)
    : null;
  if (input.tiktok_profile_url && (!canonicalTikTokProfileUrl || !tiktokHandle)) {
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
      canonicalTikTokProfileUrl,
      tiktokHandle,
      assignment: {
        accountManager: assignment.accountManager,
        accountManagerProfileId: assignment.accountManagerProfileId,
      },
    },
  };
}
