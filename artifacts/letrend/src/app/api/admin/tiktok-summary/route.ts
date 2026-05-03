import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { fetchCustomerTikTokSummaryMap } from '@/lib/tiktok/customer-runtime';

export const GET = withAuth(async () => {
  try {
    const byCustomer = await fetchCustomerTikTokSummaryMap({
      supabase: createSupabaseAdmin(),
    });
    return jsonOk({ byCustomer });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Kunde inte ladda TikTok-sammanfattning', 500);
  }
}, ['admin']);
