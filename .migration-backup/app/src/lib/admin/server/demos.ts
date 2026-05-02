import 'server-only';

import { buildDemosBoard } from '@/lib/admin/demos';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function fetchDemosBoardServer(days = 30) {
  return buildDemosBoard(createSupabaseAdmin(), days);
}
