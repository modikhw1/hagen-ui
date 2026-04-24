import 'server-only';

import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import {
  persistPendingStripeAttachments,
} from '../send-invite-support';
import { actionFailure, actionSuccess } from '../shared';
import type { ActionResult, AdminActionContext } from '../types';
import { createStripeForInvite } from './create-stripe';
import { finalizeSendInvite } from './finalize';
import { inviteUserForCustomer } from './invite-user';
import { persistInviteProfile } from './persist';
import { prepareSendInvite } from './prepare';
import type { SendInviteInput } from './types';

export async function handleSendInvite(
  ctx: AdminActionContext,
  input: SendInviteInput,
): Promise<ActionResult> {
  const prepared = await prepareSendInvite(ctx, input);
  if (!prepared.ok) {
    return actionFailure({
      error: prepared.error,
      statusCode: prepared.statusCode,
    });
  }

  const stripeArtifacts = await createStripeForInvite(
    ctx,
    input,
    prepared.value.attemptNonce,
  );
  if (!stripeArtifacts.ok) {
    return actionFailure({
      error: stripeArtifacts.error,
      statusCode: stripeArtifacts.statusCode,
    });
  }

  const invited = await inviteUserForCustomer(ctx, input, stripeArtifacts.value);
  if (!invited.ok) {
    await persistPendingStripeAttachments(
      ctx,
      stripeArtifacts.value,
      prepared.value.attemptNonce,
      'invite_recovery',
      invited.error,
    );
    return actionFailure({
      error: invited.error,
      statusCode: invited.statusCode,
    });
  }

  const persisted = await persistInviteProfile(
    ctx,
    input,
    prepared.value,
    stripeArtifacts.value,
  );
  if (!persisted.ok) {
    return actionFailure({
      error: persisted.error,
      statusCode: persisted.statusCode,
    });
  }

  await finalizeSendInvite({
    ctx,
    input,
    prepared: prepared.value,
    artifacts: stripeArtifacts.value,
    profile: persisted.value.profile as unknown as Record<string, unknown>,
  });

  return actionSuccess({
    ...buildCustomerPayload(persisted.value.profile),
    message: 'Inbjudan skickades.',
    stripe_customer_id: stripeArtifacts.value.customerId,
    stripe_subscription_id: stripeArtifacts.value.subscriptionId,
  });
}
