import 'server-only';

import type { AdminActionContext } from '../types';
import { createStripeArtifacts } from '../send-invite-support';
import type { SendInviteInput, SendInviteStepResult } from './types';

export async function createStripeForInvite(
  ctx: AdminActionContext,
  input: SendInviteInput,
  attemptNonce: number,
): Promise<SendInviteStepResult<Awaited<ReturnType<typeof createStripeArtifacts>>>> {
  try {
    return {
      ok: true,
      value: await createStripeArtifacts(ctx, input, attemptNonce),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Kunde inte skapa Stripe-prenumeration',
      statusCode: 502,
    };
  }
}
