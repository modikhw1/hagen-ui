import 'server-only';

import { customerPatchSchema } from '@/lib/schemas/customer';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import type { TablesUpdate } from '@/types/database';
import type { AdminActionContext } from '../types';
import type {
  NormalizedProfilePatch,
  UpdateProfileStepResult,
} from './types';

export async function normalizeProfilePatch(
  ctx: AdminActionContext,
  body: unknown,
): Promise<UpdateProfileStepResult<NormalizedProfilePatch>> {
  const parsedPatch = customerPatchSchema.safeParse(body);
  if (!parsedPatch.success) {
    return {
      ok: false,
      error: 'Ogiltig payload',
      statusCode: 400,
      details: parsedPatch.error.issues,
    };
  }

  const sanitizedBody = {
    ...parsedPatch.data,
  } as TablesUpdate<'customer_profiles'>;

  if (sanitizedBody.billing_day_of_month !== undefined) {
    sanitizedBody.billing_day_of_month = Math.max(
      1,
      Math.min(28, Number(sanitizedBody.billing_day_of_month) || 25),
    );
  }
  if (sanitizedBody.monthly_price !== undefined) {
    sanitizedBody.monthly_price = Number(sanitizedBody.monthly_price) || 0;
  }
  if (sanitizedBody.pricing_status !== undefined) {
    sanitizedBody.pricing_status =
      sanitizedBody.pricing_status === 'unknown' ? 'unknown' : 'fixed';
    if (sanitizedBody.pricing_status === 'unknown') {
      sanitizedBody.monthly_price = 0;
    }
  }
  if (sanitizedBody.upcoming_monthly_price !== undefined) {
    sanitizedBody.upcoming_monthly_price =
      Number(sanitizedBody.upcoming_monthly_price) || null;
  }
  if (
    sanitizedBody.upcoming_price_effective_date !== undefined &&
    !sanitizedBody.upcoming_price_effective_date
  ) {
    sanitizedBody.upcoming_price_effective_date = null;
  }
  if (Object.prototype.hasOwnProperty.call(sanitizedBody, 'account_manager')) {
    const assignment = await resolveAccountManagerAssignment(
      ctx.supabaseAdmin,
      sanitizedBody.account_manager as string | null | undefined,
    );
    sanitizedBody.account_manager = assignment.accountManager;
    sanitizedBody.account_manager_profile_id = assignment.accountManagerProfileId;
  }

  return { ok: true, value: { sanitizedBody } };
}
