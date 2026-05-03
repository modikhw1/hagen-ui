import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { fetchStudioCustomerList } from '@/lib/studio/customer-list';

export const GET = withAuth(async () => {
  const customers = await fetchStudioCustomerList({
    supabase: createSupabaseAdmin(),
  });

  return { customers };
}, ['admin', 'content_manager']);
