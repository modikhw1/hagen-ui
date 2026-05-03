import type { Tables, TablesUpdate } from '@/types/database';
import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import type { CreatedStripeArtifacts } from '../send-invite-support';

export type SendInviteInput = Extract<CustomerAction, { action: 'send_invite' }>;

export type SendInviteStepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; statusCode: number };

export type PreparedInvite = {
  attemptNonce: number;
  canonicalTikTokProfileUrl: string | null;
  tiktokHandle: string | null;
  assignment: {
    accountManager: string | null;
    accountManagerProfileId: string | null;
  };
};

export type PersistedInvite = {
  profile: Tables<'customer_profiles'>;
  updateData: TablesUpdate<'customer_profiles'>;
};

export type InviteExecutionState = {
  prepared: PreparedInvite;
  artifacts: CreatedStripeArtifacts;
};
