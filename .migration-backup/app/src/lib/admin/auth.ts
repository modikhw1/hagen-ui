import { NextRequest } from 'next/server';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function requireAdminAuth(request: NextRequest) {
  const supabase = createSupabaseAdmin();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Unauthorized', status: 401 };
  }

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!role) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }

  return { ok: true, userId: user.id };
}
