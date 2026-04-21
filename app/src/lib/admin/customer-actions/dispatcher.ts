import 'server-only';

import { requireAdminScope } from '@/lib/auth/api-auth';
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
import { buildValidationErrorResponse } from './shared';
import type { ActionResult, AdminActionContext } from './types';

async function dispatchParsedCustomerAction(
  ctx: AdminActionContext,
  action: CustomerAction,
): Promise<ActionResult> {
  switch (action.action) {
    case 'send_invite':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleSendInvite(ctx, action);
    case 'activate':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleActivate(ctx, action);
    case 'send_reminder':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleSendReminder(ctx, action);
    case 'resend_invite':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleResendInvite(ctx, action);
    case 'reactivate_archive':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleReactivate(ctx, action);
    case 'set_temporary_coverage':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleSetTemporaryCoverage(ctx, action);
    case 'cancel_subscription':
      requireAdminScope(
        ctx.user,
        'super_admin',
        'Endast super-admin kan avsluta eller kreditera abonnemang',
      );
      return handleCancelSubscription(ctx, action);
    case 'pause_subscription':
      requireAdminScope(ctx.user, 'operations_admin');
      return handlePauseSubscription(ctx, action);
    case 'resume_subscription':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleResumeSubscription(ctx, action);
    case 'change_subscription_price':
      requireAdminScope(
        ctx.user,
        'super_admin',
        'Endast super-admin kan andra abonnemangspris',
      );
      return handleChangeSubscriptionPrice(ctx, action);
    case 'change_account_manager':
      requireAdminScope(ctx.user, 'operations_admin');
      return handleChangeAccountManager(ctx, action);
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
