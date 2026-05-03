import 'server-only';

import { getAppUrl } from '@/lib/url/public';
import type { CreatedStripeArtifacts } from '../send-invite-support';
import type { AdminActionContext } from '../types';
import type { SendInviteInput, SendInviteStepResult } from './types';

export async function inviteUserForCustomer(
  ctx: AdminActionContext,
  input: SendInviteInput,
  artifacts: CreatedStripeArtifacts,
): Promise<SendInviteStepResult<null>> {
  const { error } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
    input.contact_email,
    {
      data: {
        business_name: input.business_name,
        customer_profile_id: ctx.id,
        stripe_customer_id: artifacts.customerId,
        stripe_subscription_id: artifacts.subscriptionId,
      },
      redirectTo: `${getAppUrl()}/auth/callback`,
    },
  );
  if (error) {
    return {
      ok: false,
      error: error.message,
      statusCode: 500,
    };
  }

  return { ok: true, value: null };
}
