import 'server-only';

import { buildCustomerPayload } from '@/lib/admin/customer-detail/load';
import type { CreatedStripeArtifacts } from '../send-invite-support';
import { actionFailure, actionSuccess } from '../shared';
import type { ActionResult, AdminActionContext } from '../types';
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

  // Stripe är frikopplat från invite-flödet (skapas först vid checkout).
  const stripeArtifacts: CreatedStripeArtifacts = {
    customerId: null,
    subscriptionId: null,
    productId: null,
    priceId: null,
    createdCustomer: false,
  };

  const invited = await inviteUserForCustomer(ctx, input, stripeArtifacts);
  if (!invited.ok) {
    return actionFailure({
      error: invited.error,
      statusCode: invited.statusCode,
    });
  }

  const persisted = await persistInviteProfile(
    ctx,
    input,
    prepared.value,
    stripeArtifacts,
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
    artifacts: stripeArtifacts,
    profile: persisted.value.profile as unknown as Record<string, unknown>,
  });

  return actionSuccess({
    ...buildCustomerPayload(persisted.value.profile),
    message: 'Inbjudan skickades.',
    stripe_customer_id: null,
    stripe_subscription_id: null,
  });
}
