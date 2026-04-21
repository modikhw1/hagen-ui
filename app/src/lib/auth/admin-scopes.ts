import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import type { AdminScope } from '@/lib/admin/admin-roles';

export const adminActionPolicy: Record<CustomerAction['action'], AdminScope> = {
  send_invite: 'operations_admin',
  resend_invite: 'operations_admin',
  activate: 'operations_admin',
  reactivate_archive: 'operations_admin',
  change_account_manager: 'operations_admin',
  set_temporary_coverage: 'operations_admin',
  pause_subscription: 'operations_admin',
  resume_subscription: 'operations_admin',
  send_reminder: 'operations_admin',
  change_subscription_price: 'super_admin',
  cancel_subscription: 'super_admin',
};
