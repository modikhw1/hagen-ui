import 'server-only';

import { requireAdminScope } from '@/lib/auth/api-auth';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { adminActionPolicy } from '@/lib/auth/admin-scopes';
import {
  customerActionSchema,
  type CustomerAction,
} from '@/lib/admin/schemas/customer-actions';
import { handleActivate } from './activate';
import { handleCancelSubscription } from './cancel-subscription';
import { handleChangeAccountManager } from './change-account-manager';
import { handleChangeSubscriptionPrice } from './change-subscription-price';
import { handlePauseSubscription } from './pause-subscription';
import { handleReactivate } from './reactivate';
import { handleResendInvite } from './resend-invite';
import { handleResumeSubscription } from './resume-subscription';
import { handleSendInvite } from './send-invite';
import { handleSendReminder } from './send-reminder';
import { handleSetTemporaryCoverage } from './set-temporary-coverage';
import { updateCustomerProfile } from './update-profile';
import { buildValidationErrorResponse } from './shared';
import type { ActionResult, AdminActionContext } from './types';

async function dispatchParsedCustomerAction(
  ctx: AdminActionContext,
  action: CustomerAction,
): Promise<ActionResult> {
  const requiredScope = adminActionPolicy[action.action];
  requireAdminScope(
    ctx.user,
    requiredScope,
    requiredScope === 'super_admin' ? SERVER_COPY.superAdminOnly : undefined,
  );

  switch (action.action) {
    case 'send_invite':
      return handleSendInvite(ctx, action);
    case 'activate':
      return handleActivate(ctx, action);
    case 'send_reminder':
      return handleSendReminder(ctx, action);
    case 'resend_invite':
      return handleResendInvite(ctx, action);
    case 'reactivate_archive':
      return handleReactivate(ctx, action);
    case 'set_temporary_coverage':
      return handleSetTemporaryCoverage(ctx, action);
    case 'cancel_subscription':
      return handleCancelSubscription(ctx, action);
    case 'pause_subscription':
      return handlePauseSubscription(ctx, action);
    case 'resume_subscription':
      return handleResumeSubscription(ctx, action);
    case 'change_subscription_price':
      return handleChangeSubscriptionPrice(ctx, action);
    case 'change_account_manager':
      return handleChangeAccountManager(ctx, action);
    case 'update_profile':
      return updateCustomerProfile(ctx, action);
  }
}

export async function dispatchCustomerAction(
  ctx: AdminActionContext,
  body: unknown,
): Promise<ActionResult> {
  const parsed = customerActionSchema.safeParse(body);
  if (!parsed.success) {
    return buildValidationErrorResponse(parsed.error);
  }

  return dispatchParsedCustomerAction(ctx, parsed.data);
}
