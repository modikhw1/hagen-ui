import 'server-only';

import { loadAdminOverviewCosts as loadOverviewCostsSection } from '@/lib/admin/server/overview';

export async function loadAdminOverviewCosts() {
  return loadOverviewCostsSection();
}
