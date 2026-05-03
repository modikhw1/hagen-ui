import type { CustomerAction } from '@/lib/admin/schemas/customer-actions';
import type { AdminScope } from '@/lib/admin/admin-roles';

export const adminActionPolicy: Record<CustomerAction['action'], AdminScope> = {
  send_invite: 'customers.invite',
  resend_invite: 'customers.invite',
  activate: 'customers.write',
  reactivate_archive: 'customers.write',
  change_account_manager: 'customers.write',
  set_temporary_coverage: 'customers.write',
  pause_subscription: 'customers.write',
  resume_subscription: 'customers.write',
  send_reminder: 'customers.write',
  change_subscription_price: 'super_admin',
  cancel_subscription: 'super_admin',
  update_profile: 'customers.write',
};
