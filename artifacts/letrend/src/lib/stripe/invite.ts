export type SendInviteResult = { success: boolean; error?: string };

export async function ensureStripeSubscriptionForProfile(
  _profileId: string
): Promise<void> {
  throw new Error('ensureStripeSubscriptionForProfile is server-only');
}

export async function sendCustomerInvite(_params: {
  profileId: string;
  adminId?: string;
}): Promise<SendInviteResult> {
  throw new Error('sendCustomerInvite is server-only');
}
