import 'server-only';

import { getAdminSettings } from '@/lib/admin/settings';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function fetchAdminSettingsServer() {
  return getAdminSettings(createSupabaseAdmin());
}
