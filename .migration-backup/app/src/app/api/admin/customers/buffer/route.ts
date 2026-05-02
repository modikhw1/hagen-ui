import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (_request, user) => {
  requireScope(user, 'customers.read');

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('v_customer_buffer')
      .select(
        'customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at',
      );

    if (error) {
      return jsonError(error.message || 'Kunde inte hamta bufferdata', 500);
    }

    return new Response(JSON.stringify({ bufferRows: data ?? [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    });
  } catch {
    return jsonError('Internt serverfel', 500);
  }
}, ['admin']);
